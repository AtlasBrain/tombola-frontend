// Shared in-memory protocol snapshot for admin metrics.
//
// Why one shared snapshot: every admin page (overview, users, pools)
// derives from the same underlying state — every pool + every ticket
// batch + the profile keyspace. Pulling all of that once and letting
// each view filter/aggregate is dramatically cheaper than re-issuing
// gPA scans per page.
//
// TTL: 60s. Polling clients refresh at 30s so they see at most a 30s
// stale frame; admins waiting on a fresh read get a force-refresh
// button (phase 3) that clears the cache.
//
// Cost: 2 gPA scans (public + private pools), 1 gPA scan (all ticket
// batches), 1 Redis SCAN (profile:*), in parallel. Each cached for 60s.
//
// IMPORTANT: at scale the all-batches scan can return tens of thousands
// of rows. The architecture doc flags this — phase 4 materializes a
// rolling aggregate so we don't keep paying for a full scan. For now,
// rely on the cache.

import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { generated, PROGRAM_ID, RaffleClient } from "@tombola/sdk";
import {
  decodeAccountBytes,
  fetchPrivatePools,
  fetchPublicPools,
  fetchTicketBatches,
} from "@/lib/solana/program-queries";
import { getRedis } from "@/lib/kv/redis";
import type { ProfileRow } from "@/lib/profile-store";

const SNAPSHOT_TTL_MS = 60_000;

export interface PublicPoolSnapshot {
  kind: "public";
  address: string;
  poolType: number;
  round: bigint;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: bigint;
  totalPotLamports: bigint;
  ticketPriceLamports: bigint;
  winner: string | null;
  winningTicketId: bigint | null;
  vrfPaidLamports: bigint;
}

export interface PrivatePoolSnapshot {
  kind: "private";
  address: string;
  creator: string;
  creatorFeeBps: number;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: bigint;
  totalPotLamports: bigint;
  ticketPriceLamports: bigint;
  winner: string | null;
  winningTicketId: bigint | null;
  vrfPaidLamports: bigint;
}

export type AnyPoolSnapshot = PublicPoolSnapshot | PrivatePoolSnapshot;

export interface TicketBatchSnapshot {
  address: string;
  pool: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
  quantity: bigint;
}

export interface ProfileSnapshot {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  isPublic: boolean;
  createdAt: number;
}

export interface ProtocolSnapshot {
  pools: AnyPoolSnapshot[];
  batches: TicketBatchSnapshot[];
  /** Wallet → profile. Includes every profile row in Redis, not just
   *  the ones with tickets. */
  profiles: Map<string, ProfileSnapshot>;
  treasury: {
    address: string;
    balanceLamports: bigint;
  } | null;
  /** When this snapshot was built (unix sec). */
  generatedAt: number;
}

interface CacheEntry {
  snapshot: ProtocolSnapshot;
  ts: number;
}

let cache: CacheEntry | null = null;

function unwrapOption<T>(
  v: unknown,
  map: (x: unknown) => T,
): T | null {
  // Codama Option<T> decodes as { __option: 'Some' | 'None', value? }.
  if (v && typeof v === "object" && "__option" in v) {
    const opt = v as { __option: string; value?: unknown };
    if (opt.__option === "Some") return map(opt.value);
    return null;
  }
  if (v === null || v === undefined) return null;
  return map(v);
}

function getVrfPaid(p: unknown): bigint {
  const raw = (p as { vrfPaid?: bigint | number | string | null }).vrfPaid;
  if (raw === undefined || raw === null) return 0n;
  try {
    return BigInt(raw as bigint | number | string);
  } catch {
    return 0n;
  }
}

export async function loadSnapshot(opts: { force?: boolean } = {}): Promise<ProtocolSnapshot> {
  if (!opts.force && cache && Date.now() - cache.ts < SNAPSHOT_TTL_MS) {
    return cache.snapshot;
  }
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");

  const rpc = createSolanaRpc(rpcUrl);
  const conn = new Connection(rpcUrl, "confirmed");
  const programId = String(PROGRAM_ID);

  const [publicAccounts, privateAccounts, batchAccounts, profiles, treasury] =
    await Promise.all([
      fetchPublicPools({ rpc, programId }),
      fetchPrivatePools({ rpc, programId }),
      fetchTicketBatches({ rpc, programId }),
      loadAllProfiles(),
      readTreasury(rpc, conn),
    ]);

  const pubDec = generated.getPublicPoolDecoder();
  const privDec = generated.getPrivatePoolDecoder();
  const batchDec = generated.getTicketBatchDecoder();

  const pools: AnyPoolSnapshot[] = [];

  for (const acc of publicAccounts) {
    try {
      const p = pubDec.decode(decodeAccountBytes(acc));
      pools.push({
        kind: "public",
        address: acc.pubkey,
        poolType: Number(p.poolType),
        round: BigInt(p.roundNumber),
        state: Number(p.state) as 0 | 1 | 2,
        closeTimeUnix: Number(p.closeTime),
        totalTickets: BigInt(p.totalTickets),
        totalPotLamports: BigInt(p.totalPot),
        ticketPriceLamports: BigInt(p.ticketPrice),
        winner: unwrapOption<string>(p.winner, String),
        winningTicketId: unwrapOption<bigint>(p.winningTicket, (v) =>
          BigInt(v as bigint | number | string),
        ),
        vrfPaidLamports: getVrfPaid(p),
      });
    } catch {
      // Skip malformed.
    }
  }

  for (const acc of privateAccounts) {
    try {
      const p = privDec.decode(decodeAccountBytes(acc));
      pools.push({
        kind: "private",
        address: acc.pubkey,
        creator: String(p.creator),
        creatorFeeBps: Number(p.creatorFeeBps),
        state: Number(p.state) as 0 | 1 | 2,
        closeTimeUnix: Number(p.closeTime),
        totalTickets: BigInt(p.totalTickets),
        totalPotLamports: BigInt(p.totalPot),
        ticketPriceLamports: BigInt(p.ticketPrice),
        winner: unwrapOption<string>(p.winner, String),
        winningTicketId: unwrapOption<bigint>(p.winningTicket, (v) =>
          BigInt(v as bigint | number | string),
        ),
        vrfPaidLamports: getVrfPaid(p),
      });
    } catch {
      // Skip malformed.
    }
  }

  const batches: TicketBatchSnapshot[] = [];
  for (const acc of batchAccounts) {
    try {
      const b = batchDec.decode(decodeAccountBytes(acc));
      const first = BigInt(b.firstTicketId);
      const last = BigInt(b.lastTicketId);
      batches.push({
        address: acc.pubkey,
        pool: String(b.pool),
        owner: String(b.owner),
        firstTicketId: first,
        lastTicketId: last,
        quantity: last - first + 1n,
      });
    } catch {
      // Skip malformed.
    }
  }

  const snapshot: ProtocolSnapshot = {
    pools,
    batches,
    profiles,
    treasury,
    generatedAt: Math.floor(Date.now() / 1000),
  };
  cache = { snapshot, ts: Date.now() };
  return snapshot;
}

export function clearSnapshotCache() {
  cache = null;
}

// ───────────────────────────── internals ─────────────────────────────

async function loadAllProfiles(): Promise<Map<string, ProfileSnapshot>> {
  const m = new Map<string, ProfileSnapshot>();
  const r = getRedis();
  if (!r) return m;
  let cursor: string | number = 0;
  for (let i = 0; i < 200; i++) {
    const [next, keys] = (await r.scan(cursor, {
      match: "profile:*",
      count: 1000,
    })) as [string | number, string[]];
    if (keys.length > 0) {
      // mget supports a string-array signature in @upstash/redis.
      const rows = (await r.mget(...keys)) as Array<ProfileRow | null>;
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        if (!row) continue;
        m.set(row.wallet, {
          wallet: row.wallet,
          pseudo: row.pseudo,
          xHandle: row.xHandle,
          isPublic: row.isPublic,
          createdAt: row.createdAt,
        });
      }
    }
    if (String(next) === "0") break;
    cursor = next;
  }
  return m;
}

async function readTreasury(
  rpc: unknown,
  conn: Connection,
): Promise<ProtocolSnapshot["treasury"]> {
  try {
    const client = new RaffleClient({
      rpc: rpc as ConstructorParameters<typeof RaffleClient>[0]["rpc"],
    });
    const cfg = await client.getProtocolConfig();
    const address = String(cfg.treasury);
    const balance = await conn.getBalance(new PublicKey(address), "confirmed");
    return { address, balanceLamports: BigInt(balance) };
  } catch {
    return null;
  }
}

// Aggregate executive-overview metrics for the admin dashboard.
//
// Pure server-side. Reads on-chain via program-queries + the off-chain
// profile keyspace via Upstash. No write paths.
//
// Costs:
//   - 2 getProgramAccounts calls (public + private pools, by dataSize).
//   - 1 SCAN over `profile:*` keys.
//   - 1 getBalance for the treasury pubkey.
// Total: ~4 RPC + 1 Redis SCAN per refresh. We cache the result in
// process memory for OVERVIEW_TTL_MS so polling clients don't pummel the
// RPC.
//
// Everything is "lifetime" — phase-2 will layer 7-day windows on top
// once we materialize settle timestamps. For now the page shows
// life-to-date numbers honestly.

import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { generated, PROGRAM_ID, RaffleClient } from "@tombola/sdk";
import {
  decodeAccountBytes,
  fetchPrivatePools,
  fetchPublicPools,
} from "@/lib/solana/program-queries";
import { getRedis } from "@/lib/kv/redis";

const OVERVIEW_TTL_MS = 30_000;

export interface OverviewKpis {
  /** Sum of total_pot across every pool ever, lamports. */
  lifetimeVolumeLamports: string;
  /** Sum of protocol_fee across resolved pools only, lamports. */
  lifetimeFeesLamports: string;
  /** Sum of winner_share across resolved pools, lamports. */
  lifetimePayoutsLamports: string;
  /** Pending payout exposure — total_pot for AwaitingVrf pools. */
  pendingPayoutsLamports: string;
  /** Tickets sold lifetime. */
  totalTickets: string;
  /** Pool counts by state + kind. */
  pools: {
    public: { open: number; drawing: number; resolved: number };
    private: { open: number; drawing: number; resolved: number };
  };
  /** Total profile rows. */
  totalUsers: number;
  /** Treasury pubkey (from ProtocolConfig) + live balance in lamports. */
  treasury: {
    address: string;
    balanceLamports: string;
    isMultisig: boolean; // null-equivalent fallback — see comment in impl
  };
  /** Snapshot timestamp (unix sec). */
  generatedAt: number;
}

export interface LivePoolRow {
  address: string;
  kind: "public" | "private";
  poolType?: number;        // public only
  round?: string;           // public only (bigint-as-string)
  state: 0 | 1 | 2;         // 0 Open, 1 AwaitingVrf, 2 Resolved
  totalTickets: string;
  totalPotLamports: string;
  closeTimeUnix: number;
  ticketPriceLamports: string;
}

export interface OverviewPayload {
  kpis: OverviewKpis;
  livePools: LivePoolRow[];
}

interface CacheEntry {
  payload: OverviewPayload;
  ts: number;
}

let cache: CacheEntry | null = null;

const PROTOCOL_FEE_BPS = 50n;
const BPS_DEN = 10_000n;

export async function getOverview(): Promise<OverviewPayload> {
  if (cache && Date.now() - cache.ts < OVERVIEW_TTL_MS) {
    return cache.payload;
  }
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");
  }
  const rpc = createSolanaRpc(rpcUrl);
  const web3conn = new Connection(rpcUrl, "confirmed");
  const programId = String(PROGRAM_ID);

  const [publicAccounts, privateAccounts, profileCount, treasuryInfo] =
    await Promise.all([
      fetchPublicPools({ rpc, programId }),
      // gPA without state filter — gets all private pools regardless of state.
      fetchPrivatePools({ rpc, programId }),
      countProfiles(),
      readTreasury(rpc, web3conn),
    ]);

  const pubDec = generated.getPublicPoolDecoder();
  const privDec = generated.getPrivatePoolDecoder();

  let totalVolume = 0n;
  let totalFees = 0n;
  let totalPayouts = 0n;
  let pendingPayouts = 0n;
  let totalTickets = 0n;
  const pools = {
    public: { open: 0, drawing: 0, resolved: 0 },
    private: { open: 0, drawing: 0, resolved: 0 },
  };

  const livePools: LivePoolRow[] = [];

  for (const acc of publicAccounts) {
    try {
      const p = pubDec.decode(decodeAccountBytes(acc));
      const state = Number(p.state) as 0 | 1 | 2;
      const pot = BigInt(p.totalPot);
      totalVolume += pot;
      totalTickets += BigInt(p.totalTickets);
      if (state === 0) pools.public.open += 1;
      else if (state === 1) {
        pools.public.drawing += 1;
        pendingPayouts += pot;
      } else if (state === 2) {
        pools.public.resolved += 1;
        const fee = (pot * PROTOCOL_FEE_BPS) / BPS_DEN;
        // vrf_paid is u64 on-chain; older SDK builds may not expose it.
        // Subtract a safe lower bound (0) if missing.
        const vrfPaid = BigInt(((p as unknown as { vrfPaid?: bigint }).vrfPaid) ?? 0n);
        const netFee = fee > vrfPaid ? fee - vrfPaid : 0n;
        totalFees += netFee;
        totalPayouts += pot - fee;
      }
      if (state !== 2) {
        livePools.push({
          address: acc.pubkey,
          kind: "public",
          poolType: Number(p.poolType),
          round: BigInt(p.roundNumber).toString(),
          state,
          totalTickets: BigInt(p.totalTickets).toString(),
          totalPotLamports: pot.toString(),
          closeTimeUnix: Number(p.closeTime),
          ticketPriceLamports: BigInt(p.ticketPrice).toString(),
        });
      }
    } catch {
      // Skip malformed account silently — never break the dashboard
      // because of one weird record.
    }
  }

  for (const acc of privateAccounts) {
    try {
      const p = privDec.decode(decodeAccountBytes(acc));
      const state = Number(p.state) as 0 | 1 | 2;
      const pot = BigInt(p.totalPot);
      totalVolume += pot;
      totalTickets += BigInt(p.totalTickets);
      if (state === 0) pools.private.open += 1;
      else if (state === 1) {
        pools.private.drawing += 1;
        pendingPayouts += pot;
      } else if (state === 2) {
        pools.private.resolved += 1;
        const fee = (pot * PROTOCOL_FEE_BPS) / BPS_DEN;
        const vrfPaid = BigInt(((p as unknown as { vrfPaid?: bigint }).vrfPaid) ?? 0n);
        const creatorBps = BigInt(p.creatorFeeBps);
        const creatorFee = (pot * creatorBps) / BPS_DEN;
        const netFee = fee > vrfPaid ? fee - vrfPaid : 0n;
        totalFees += netFee;
        totalPayouts += pot - fee - creatorFee;
      }
      if (state !== 2) {
        livePools.push({
          address: acc.pubkey,
          kind: "private",
          state,
          totalTickets: BigInt(p.totalTickets).toString(),
          totalPotLamports: pot.toString(),
          closeTimeUnix: Number(p.closeTime),
          ticketPriceLamports: BigInt(p.ticketPrice).toString(),
        });
      }
    } catch {
      // Same defensive skip as public.
    }
  }

  // Surface the 8 most-urgent live pools (closest close-time first), so
  // the overview row stays readable. The dedicated /admin/pools page
  // (phase 2) will paginate the full list.
  livePools.sort((a, b) => a.closeTimeUnix - b.closeTimeUnix);
  const trimmed = livePools.slice(0, 8);

  const payload: OverviewPayload = {
    kpis: {
      lifetimeVolumeLamports: totalVolume.toString(),
      lifetimeFeesLamports: totalFees.toString(),
      lifetimePayoutsLamports: totalPayouts.toString(),
      pendingPayoutsLamports: pendingPayouts.toString(),
      totalTickets: totalTickets.toString(),
      pools,
      totalUsers: profileCount,
      treasury: treasuryInfo,
      generatedAt: Math.floor(Date.now() / 1000),
    },
    livePools: trimmed,
  };

  cache = { payload, ts: Date.now() };
  return payload;
}

/** Single helper so route + tests can blow away cache deterministically. */
export function clearOverviewCache() {
  cache = null;
}

// ───────────────────────────── internals ─────────────────────────────

async function countProfiles(): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  // Upstash SCAN returns [cursor, keys]. We use match=`profile:*` with a
  // generous count hint. At v1 scale (low thousands) one round-trip per
  // overview poll is acceptable; if it ever bites, materialize a counter
  // in phase 4.
  let cursor: string | number = 0;
  let total = 0;
  // Hard cap iterations so a runaway scan can't stall the route.
  for (let i = 0; i < 100; i++) {
    const [next, keys] = (await r.scan(cursor, {
      match: "profile:*",
      count: 1000,
    })) as [string | number, string[]];
    total += keys.length;
    if (String(next) === "0") break;
    cursor = next;
  }
  return total;
}

async function readTreasury(
  rpc: unknown,
  conn: Connection,
): Promise<OverviewKpis["treasury"]> {
  try {
    const client = new RaffleClient({
      rpc: rpc as ConstructorParameters<typeof RaffleClient>[0]["rpc"],
    });
    const cfg = await client.getProtocolConfig();
    const address = String(cfg.treasury);
    const balance = await conn.getBalance(new PublicKey(address), "confirmed");
    // We have no on-chain hint as to whether `address` is a Squads vault
    // PDA vs a regular keypair. Heuristic: Squads vault PDAs have program
    // owner == Squads program id. Detecting that requires another RPC
    // call; defer to phase 3 (treasury detail page). For now expose
    // false and let the UI show "verify in Squads" rather than asserting.
    return {
      address,
      balanceLamports: balance.toString(),
      isMultisig: false,
    };
  } catch {
    return {
      address: "",
      balanceLamports: "0",
      isMultisig: false,
    };
  }
}

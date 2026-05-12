// Per-pool drill-down aggregator.
//
// Pulls every TicketBatch in the pool, every invite row (private),
// and surfaces a winner-share + risk-flag readout.

import "server-only";
import { getRedis } from "@/lib/kv/redis";
import {
  computeProtocolFee,
  computeCreatorFee,
  computeWinnerShare,
  computeTreasuryShare,
} from "@/lib/admin/metrics/fees";
import { loadRiskThresholds } from "@/lib/admin/risk-config";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";

export interface PoolDetail {
  address: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  creator?: string;
  creatorFeeBps?: number;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: string;
  totalPotLamports: string;
  ticketPriceLamports: string;
  winner: string | null;
  winningTicketId: string | null;
  /** Pre-/post-settle ledger. */
  ledger: {
    grossProtocolFeeLamports: string;
    treasuryShareLamports: string;
    creatorShareLamports: string;
    winnerShareLamports: string;
    vrfPaidLamports: string;
  };
  /** Distinct participant count + per-owner ticket+spend rollup. */
  participants: Array<{
    wallet: string;
    tickets: string;
    spentLamports: string;
    sharePct: number; // 0–100
  }>;
  /** Private pool: invite roster. */
  invites?: Array<{
    friend: string;
    status: "sent" | "redeemed";
  }>;
  flags: string[];
}

const BY_POOL_PREFIX = "pool-invites-by-pool:";
const INVITE_PREFIX = "pool-invite:";

export async function aggregatePoolDetail(
  poolAddress: string,
  snap: ProtocolSnapshot,
): Promise<PoolDetail | null> {
  const pool = snap.pools.find((p) => p.address === poolAddress);
  if (!pool) return null;

  // Bucket batches for this pool by owner.
  const byOwner = new Map<string, { tickets: bigint; spent: bigint }>();
  for (const b of snap.batches) {
    if (b.pool !== poolAddress) continue;
    const cur = byOwner.get(b.owner) ?? { tickets: 0n, spent: 0n };
    cur.tickets += b.quantity;
    cur.spent += b.quantity * pool.ticketPriceLamports;
    byOwner.set(b.owner, cur);
  }
  const participants = [...byOwner.entries()]
    .map(([wallet, v]) => ({
      wallet,
      tickets: v.tickets.toString(),
      spentLamports: v.spent.toString(),
      sharePct:
        pool.totalTickets > 0n
          ? Number((v.tickets * 10_000n) / pool.totalTickets) / 100
          : 0,
    }))
    .sort((a, b) => Number(BigInt(b.tickets) - BigInt(a.tickets)));

  // Ledger math.
  const creatorBps =
    pool.kind === "private" ? BigInt(pool.creatorFeeBps) : 0n;
  const gross = computeProtocolFee(pool.totalPotLamports);
  const treasury = computeTreasuryShare(
    pool.totalPotLamports,
    pool.vrfPaidLamports,
  );
  const creator = computeCreatorFee(pool.totalPotLamports, creatorBps);
  const winner = computeWinnerShare(pool.totalPotLamports, creatorBps);

  const thresholds = loadRiskThresholds();
  const nowSec = Math.floor(Date.now() / 1000);
  const flags: string[] = [];
  if (
    pool.state === 1 &&
    nowSec - pool.closeTimeUnix > thresholds.stuckThresholdSec
  ) {
    flags.push("STUCK");
  }
  if (pool.totalTickets > 0n) {
    const pctScaled = BigInt(thresholds.concentratedStakePct);
    for (const v of byOwner.values()) {
      if (v.tickets * 100n > pool.totalTickets * pctScaled) {
        flags.push("CONCENTRATED_STAKE");
        break;
      }
    }
  }
  if (
    pool.kind === "private" &&
    pool.state === 2 &&
    pool.winner === pool.creator
  ) {
    const ownerQty = byOwner.get(pool.creator)?.tickets ?? 0n;
    const pctScaled = BigInt(thresholds.selfDealOwnerPct);
    if (
      pool.totalTickets > 0n &&
      ownerQty * 100n >= pool.totalTickets * pctScaled
    ) {
      flags.push("SELF_DEAL_SUSPECT");
    }
  }
  if (pool.kind === "private" && pool.totalTickets === 0n) {
    flags.push("EMPTY");
  }

  let invites: PoolDetail["invites"];
  if (pool.kind === "private") {
    invites = await loadInvites(pool.address);
  }

  return {
    address: pool.address,
    kind: pool.kind,
    poolType: pool.kind === "public" ? pool.poolType : undefined,
    round: pool.kind === "public" ? pool.round.toString() : undefined,
    creator: pool.kind === "private" ? pool.creator : undefined,
    creatorFeeBps: pool.kind === "private" ? pool.creatorFeeBps : undefined,
    state: pool.state,
    closeTimeUnix: pool.closeTimeUnix,
    totalTickets: pool.totalTickets.toString(),
    totalPotLamports: pool.totalPotLamports.toString(),
    ticketPriceLamports: pool.ticketPriceLamports.toString(),
    winner: pool.winner,
    winningTicketId: pool.winningTicketId
      ? pool.winningTicketId.toString()
      : null,
    ledger: {
      grossProtocolFeeLamports: gross.toString(),
      treasuryShareLamports: treasury.toString(),
      creatorShareLamports: creator.toString(),
      winnerShareLamports: winner.toString(),
      vrfPaidLamports: pool.vrfPaidLamports.toString(),
    },
    participants,
    invites,
    flags,
  };
}

async function loadInvites(
  poolAddress: string,
): Promise<NonNullable<PoolDetail["invites"]>> {
  const r = getRedis();
  if (!r) return [];
  try {
    const friends = (await r.smembers(
      `${BY_POOL_PREFIX}${poolAddress}`,
    )) as string[];
    if (friends.length === 0) return [];
    const pipe = r.pipeline();
    for (const f of friends) pipe.get(`${INVITE_PREFIX}${poolAddress}:${f}`);
    const rows = (await pipe.exec()) as Array<
      { friend?: string; status?: "sent" | "redeemed" } | null
    >;
    const out: NonNullable<PoolDetail["invites"]> = [];
    for (let i = 0; i < friends.length; i++) {
      const row = rows[i];
      if (!row) continue;
      out.push({
        friend: row.friend ?? friends[i],
        status: row.status === "redeemed" ? "redeemed" : "sent",
      });
    }
    return out;
  } catch {
    return [];
  }
}

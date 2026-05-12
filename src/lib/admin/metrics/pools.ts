// Cross-pool aggregator for the /admin/pools page.
//
// Derives every pool row from the shared snapshot. Each row includes
// participant count (distinct batch owners), invite-funnel counts for
// private pools (via off-chain pool-invite store), and a coarse risk
// classification (stuck / concentrated stake / self-deal suspect).

import "server-only";
import { getRedis } from "@/lib/kv/redis";
import { computeProtocolFee, computeCreatorFee, computeTreasuryShare } from "@/lib/admin/metrics/fees";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";

export interface PoolRow {
  address: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  creator?: string;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: string;
  totalPotLamports: string;
  ticketPriceLamports: string;
  participants: number;
  /** Lamports: feesAccrued = protocol_fee for resolved, else 0. */
  feesLamports: string;
  /** Private only: # of invites in pool-invite store (sent + redeemed). */
  invitesSent?: number;
  invitesRedeemed?: number;
  /** Creator fee bps (private pools). */
  creatorFeeBps?: number;
  /** Winner if resolved. */
  winner?: string;
  /** Risk flags. */
  flags: string[];
}

export interface PoolsPayload {
  rows: PoolRow[];
  totals: {
    totalPools: number;
    publicCount: number;
    privateCount: number;
    livePools: number;
    drawingPools: number;
    resolvedPools: number;
    emptyPrivatePools: number;
    invitesSent: number;
    invitesRedeemed: number;
  };
  generatedAt: number;
}

const STUCK_THRESHOLD_SEC = 60 * 60; // 1h in AwaitingVrf

export async function aggregatePools(
  snap: ProtocolSnapshot,
): Promise<PoolsPayload> {
  // Bucket batches by pool address.
  const byPool = new Map<string, Map<string, bigint>>(); // pool → owner → tickets
  for (const b of snap.batches) {
    const m = byPool.get(b.pool) ?? new Map<string, bigint>();
    m.set(b.owner, (m.get(b.owner) ?? 0n) + b.quantity);
    byPool.set(b.pool, m);
  }

  const privatePoolAddresses = snap.pools
    .filter((p) => p.kind === "private")
    .map((p) => p.address);
  const inviteCounts = await loadInviteCounts(privatePoolAddresses);
  const inviteStatusBulk = await loadInviteStatuses(
    privatePoolAddresses,
    inviteCounts,
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const rows: PoolRow[] = [];
  let publicCount = 0;
  let privateCount = 0;
  let livePools = 0;
  let drawingPools = 0;
  let resolvedPools = 0;
  let emptyPrivatePools = 0;
  let invitesSent = 0;
  let invitesRedeemed = 0;

  for (const p of snap.pools) {
    const ownersMap = byPool.get(p.address) ?? new Map<string, bigint>();
    const participants = ownersMap.size;
    const flags: string[] = [];

    // Stuck: AwaitingVrf for > 1h.
    if (p.state === 1 && nowSec - p.closeTimeUnix > STUCK_THRESHOLD_SEC) {
      flags.push("STUCK");
    }
    // Concentrated stake: any owner > 80%.
    if (p.totalTickets > 0n) {
      for (const qty of ownersMap.values()) {
        if (qty * 100n > p.totalTickets * 80n) {
          flags.push("CONCENTRATED_STAKE");
          break;
        }
      }
    }
    // Self-deal: private + creator owns ≥50% + creator won.
    if (p.kind === "private" && p.state === 2 && p.winner === p.creator) {
      const ownerQty = ownersMap.get(p.creator) ?? 0n;
      if (p.totalTickets > 0n && ownerQty * 100n >= p.totalTickets * 50n) {
        flags.push("SELF_DEAL_SUSPECT");
      }
    }
    // Empty: private + no tickets + > 1d old (close_time in past, totals == 0).
    if (p.kind === "private" && p.totalTickets === 0n) {
      emptyPrivatePools += 1;
      flags.push("EMPTY");
    }

    // Fees: only credit at settle. Treasury share = gross fee - vrf_paid.
    const fees =
      p.state === 2
        ? computeTreasuryShare(p.totalPotLamports, p.vrfPaidLamports)
        : 0n;

    // Tally.
    if (p.kind === "public") publicCount += 1;
    else privateCount += 1;
    if (p.state === 0) livePools += 1;
    else if (p.state === 1) drawingPools += 1;
    else resolvedPools += 1;

    const row: PoolRow = {
      address: p.address,
      kind: p.kind,
      poolType: p.kind === "public" ? p.poolType : undefined,
      round: p.kind === "public" ? p.round.toString() : undefined,
      creator: p.kind === "private" ? p.creator : undefined,
      creatorFeeBps: p.kind === "private" ? p.creatorFeeBps : undefined,
      state: p.state,
      closeTimeUnix: p.closeTimeUnix,
      totalTickets: p.totalTickets.toString(),
      totalPotLamports: p.totalPotLamports.toString(),
      ticketPriceLamports: p.ticketPriceLamports.toString(),
      participants,
      feesLamports: fees.toString(),
      winner: p.winner ?? undefined,
      flags,
    };

    if (p.kind === "private") {
      const ic = inviteCounts.get(p.address);
      row.invitesSent = ic ?? 0;
      const status = inviteStatusBulk.get(p.address);
      const redeemed = status?.redeemed ?? 0;
      row.invitesRedeemed = redeemed;
      invitesSent += row.invitesSent;
      invitesRedeemed += redeemed;
    }
    rows.push(row);
  }

  // Sort: live + drawing first (soonest close ascending), then resolved
  // newest first. Empty private pools sink to bottom.
  rows.sort((a, b) => {
    const aGroup = groupKey(a);
    const bGroup = groupKey(b);
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (aGroup === 0 || aGroup === 1) {
      return a.closeTimeUnix - b.closeTimeUnix;
    }
    return b.closeTimeUnix - a.closeTimeUnix;
  });

  return {
    rows,
    totals: {
      totalPools: snap.pools.length,
      publicCount,
      privateCount,
      livePools,
      drawingPools,
      resolvedPools,
      emptyPrivatePools,
      invitesSent,
      invitesRedeemed,
    },
    generatedAt: snap.generatedAt,
  };
}

function groupKey(p: PoolRow): number {
  if (p.flags.includes("EMPTY")) return 3;
  if (p.state === 1) return 0;
  if (p.state === 0) return 1;
  return 2; // resolved
}

// ─── Invite-store loaders ────────────────────────────────────────────

const BY_POOL_PREFIX = "pool-invites-by-pool:";
const INVITE_PREFIX = "pool-invite:";

async function loadInviteCounts(
  poolAddresses: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (poolAddresses.length === 0) return out;
  const r = getRedis();
  if (!r) return out;
  const pipe = r.pipeline();
  for (const a of poolAddresses) pipe.scard(`${BY_POOL_PREFIX}${a}`);
  const results = (await pipe.exec()) as Array<number | null | undefined>;
  for (let i = 0; i < poolAddresses.length; i++) {
    out.set(poolAddresses[i], (results[i] as number | undefined) ?? 0);
  }
  return out;
}

async function loadInviteStatuses(
  poolAddresses: string[],
  inviteCounts: Map<string, number>,
): Promise<Map<string, { sent: number; redeemed: number }>> {
  const out = new Map<string, { sent: number; redeemed: number }>();
  const r = getRedis();
  if (!r) return out;
  for (const pool of poolAddresses) {
    const count = inviteCounts.get(pool) ?? 0;
    if (count === 0) {
      out.set(pool, { sent: 0, redeemed: 0 });
      continue;
    }
    try {
      const friends = (await r.smembers(`${BY_POOL_PREFIX}${pool}`)) as string[];
      if (friends.length === 0) {
        out.set(pool, { sent: 0, redeemed: 0 });
        continue;
      }
      const pipe = r.pipeline();
      for (const f of friends) pipe.get(`${INVITE_PREFIX}${pool}:${f}`);
      const rows = (await pipe.exec()) as Array<
        { status?: "sent" | "redeemed" } | null
      >;
      let sent = 0;
      let redeemed = 0;
      for (const row of rows) {
        if (!row) continue;
        if (row.status === "redeemed") redeemed += 1;
        else sent += 1;
      }
      out.set(pool, { sent, redeemed });
    } catch {
      out.set(pool, { sent: 0, redeemed: 0 });
    }
  }
  return out;
}

// Re-export fee helpers so route can use them without a second import line.
export { computeProtocolFee, computeCreatorFee };

// Per-user drill-down aggregator.
//
// Derives a wallet's full profile + activity timeline + per-pool
// participation breakdown from the shared snapshot. Returns null when
// the wallet has neither a profile row nor any TicketBatches — i.e.
// the dashboard should 404 it.

import "server-only";
import { getFriendLists } from "@/lib/friend-store";
import { computeWinnerShare } from "@/lib/admin/metrics/fees";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";

export interface PoolEntry {
  pool: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  myTickets: string;
  mySpentLamports: string;
  totalTickets: string;
  totalPotLamports: string;
  iWon: boolean;
  myShareLamports: string;
}

export interface CadenceBreakdown {
  cadence: "WEEKLY" | "BIWEEKLY" | "TRIWEEKLY" | "MONTHLY" | "PRIVATE";
  pools: number;
  tickets: string;
  spentLamports: string;
}

export interface UserDetail {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  isPublic: boolean;
  createdAtMs: number;
  /** Lifetime aggregates */
  totals: {
    pools: number;
    tickets: string;
    spentLamports: string;
    wins: number;
    wonLamports: string;
    netPnLLamports: string;
    bestWinLamports: string;
  };
  /** Sorted by closeTimeUnix DESC (most recent first). */
  participations: PoolEntry[];
  /** Pool-cadence breakdown (for the bar chart in the drill-down). */
  cadenceBreakdown: CadenceBreakdown[];
  /** Friend lists (full wallet lists — caller can render counts +
   *  resolved names). */
  friends: {
    accepted: string[];
    pendingOut: string[];
    pendingIn: string[];
  };
  flags: string[];
}

const CADENCE_LABEL: Record<number, CadenceBreakdown["cadence"]> = {
  0: "WEEKLY",
  1: "BIWEEKLY",
  2: "TRIWEEKLY",
  3: "MONTHLY",
};

export async function aggregateUserDetail(
  wallet: string,
  snap: ProtocolSnapshot,
): Promise<UserDetail | null> {
  const profile = snap.profiles.get(wallet) ?? null;
  const poolByAddress = new Map<string, ProtocolSnapshot["pools"][number]>();
  for (const p of snap.pools) poolByAddress.set(p.address, p);

  // Bucket batches by pool for this wallet.
  const myBatchesByPool = new Map<string, { tickets: bigint; spent: bigint }>();
  let lifetimeTickets = 0n;
  let lifetimeSpent = 0n;
  for (const b of snap.batches) {
    if (b.owner !== wallet) continue;
    const pool = poolByAddress.get(b.pool);
    if (!pool) continue;
    const spent = b.quantity * pool.ticketPriceLamports;
    lifetimeTickets += b.quantity;
    lifetimeSpent += spent;
    const cur =
      myBatchesByPool.get(b.pool) ?? { tickets: 0n, spent: 0n };
    cur.tickets += b.quantity;
    cur.spent += spent;
    myBatchesByPool.set(b.pool, cur);
  }

  // No activity AND no profile → not a user.
  if (!profile && myBatchesByPool.size === 0) return null;

  // Build per-pool participations.
  const participations: PoolEntry[] = [];
  let wins = 0;
  let lifetimeWon = 0n;
  let bestWin = 0n;
  let spentOnResolved = 0n;
  for (const [poolAddr, mine] of myBatchesByPool) {
    const pool = poolByAddress.get(poolAddr)!;
    const creatorBps =
      pool.kind === "private" ? BigInt(pool.creatorFeeBps) : 0n;
    const iWon = pool.state === 2 && pool.winner === wallet;
    const myShare = iWon
      ? computeWinnerShare(pool.totalPotLamports, creatorBps)
      : 0n;
    if (iWon) {
      wins += 1;
      lifetimeWon += myShare;
      if (myShare > bestWin) bestWin = myShare;
    }
    if (pool.state === 2) spentOnResolved += mine.spent;
    participations.push({
      pool: poolAddr,
      kind: pool.kind,
      poolType: pool.kind === "public" ? pool.poolType : undefined,
      round: pool.kind === "public" ? pool.round.toString() : undefined,
      state: pool.state,
      closeTimeUnix: pool.closeTimeUnix,
      myTickets: mine.tickets.toString(),
      mySpentLamports: mine.spent.toString(),
      totalTickets: pool.totalTickets.toString(),
      totalPotLamports: pool.totalPotLamports.toString(),
      iWon,
      myShareLamports: myShare.toString(),
    });
  }
  participations.sort((a, b) => b.closeTimeUnix - a.closeTimeUnix);

  // Cadence breakdown.
  const cadenceMap = new Map<
    CadenceBreakdown["cadence"],
    { pools: number; tickets: bigint; spent: bigint }
  >();
  for (const e of participations) {
    const cad: CadenceBreakdown["cadence"] =
      e.kind === "private"
        ? "PRIVATE"
        : (CADENCE_LABEL[e.poolType ?? 0] ?? "WEEKLY");
    const cur =
      cadenceMap.get(cad) ?? { pools: 0, tickets: 0n, spent: 0n };
    cur.pools += 1;
    cur.tickets += BigInt(e.myTickets);
    cur.spent += BigInt(e.mySpentLamports);
    cadenceMap.set(cad, cur);
  }
  const cadenceBreakdown: CadenceBreakdown[] = [];
  for (const cad of ["WEEKLY", "BIWEEKLY", "TRIWEEKLY", "MONTHLY", "PRIVATE"] as const) {
    const v = cadenceMap.get(cad);
    if (v) {
      cadenceBreakdown.push({
        cadence: cad,
        pools: v.pools,
        tickets: v.tickets.toString(),
        spentLamports: v.spent.toString(),
      });
    }
  }

  // Friend lists — single Redis call.
  let friends = { accepted: [] as string[], pendingOut: [] as string[], pendingIn: [] as string[] };
  try {
    const lists = await getFriendLists(wallet);
    friends = {
      accepted: lists.friends,
      pendingOut: lists.pendingOut,
      pendingIn: lists.pendingIn,
    };
  } catch {
    // Redis unavailable — leave empty arrays.
  }

  const flags: string[] = [];
  if (myBatchesByPool.size > 25) flags.push("HIGH_ACTIVITY");
  if (lifetimeSpent > 50n * 1_000_000_000n) flags.push("BIG_SPENDER");
  if (!profile && lifetimeSpent > 10n * 1_000_000_000n) {
    flags.push("UNCLAIMED_HIGH_SPEND");
  }
  // Self-deal check: any private pool the wallet created where they
  // won + they bought ≥50% of tickets.
  for (const p of snap.pools) {
    if (
      p.kind === "private" &&
      p.creator === wallet &&
      p.winner === wallet &&
      p.state === 2
    ) {
      const mine = myBatchesByPool.get(p.address);
      if (mine && p.totalTickets > 0n) {
        const sharePct = (mine.tickets * 100n) / p.totalTickets;
        if (sharePct >= 50n) {
          flags.push("SELF_DEAL_SUSPECT");
          break;
        }
      }
    }
  }

  return {
    wallet,
    pseudo: profile?.pseudo ?? null,
    xHandle: profile?.xHandle ?? null,
    isPublic: profile?.isPublic ?? true,
    createdAtMs: profile?.createdAt ?? 0,
    totals: {
      pools: myBatchesByPool.size,
      tickets: lifetimeTickets.toString(),
      spentLamports: lifetimeSpent.toString(),
      wins,
      wonLamports: lifetimeWon.toString(),
      netPnLLamports: (lifetimeWon - spentOnResolved).toString(),
      bestWinLamports: bestWin.toString(),
    },
    participations,
    cadenceBreakdown,
    friends,
    flags,
  };
}

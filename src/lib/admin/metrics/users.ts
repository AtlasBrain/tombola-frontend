// Derive per-user aggregates from the shared protocol snapshot.
//
// Combines:
//   - On-chain TicketBatches (groups by owner → tickets, spend, pools)
//   - On-chain PublicPool / PrivatePool winners (wins, won lamports)
//   - Off-chain ProfileRow (pseudo, X handle, public/private flag,
//     createdAt)
//   - Off-chain friend-store SCARD (friend count)
//
// Output is sortable + filterable client-side. For the row count we
// expect (low thousands), shipping the full set with the page and
// paginating in-browser is faster than chatty server-side pagination.

import "server-only";
import { friendCountsByWallet } from "@/lib/admin/metrics/friends-bulk";
import { PROTOCOL_FEE_BPS, BPS_DEN, computeWinnerShare } from "@/lib/admin/metrics/fees";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";

export interface UserRow {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  isPublic: boolean;
  /** Unix ms — profile.createdAt, or 0 if no profile. */
  createdAtMs: number;
  /** Tickets bought lifetime. */
  tickets: string;
  /** Total spent in lamports (sum quantity * pool.ticketPrice). */
  spentLamports: string;
  /** Total won in lamports (winner share across resolved pools won). */
  wonLamports: string;
  /** Best single win in lamports. */
  bestWinLamports: string;
  /** Resolved pools the wallet had tickets in. */
  resolvedPools: number;
  /** Resolved pools the wallet won. */
  wins: number;
  /** Distinct pools the wallet has bought into. */
  pools: number;
  /** Public pools touched. */
  publicPools: number;
  /** Private pools touched. */
  privatePools: number;
  /** Net P&L on resolved-only pools. */
  netPnLLamports: string;
  /** Friend count (accepted). */
  friends: number;
  /** Risk flags surfaced for this user. */
  flags: string[];
  /** Wallet appears in batches but has no profile row. */
  hasProfile: boolean;
}

export interface UsersPayload {
  rows: UserRow[];
  totals: {
    totalUsersWithProfile: number;
    totalUsersWithTickets: number;
    privateProfiles: number;
    publicProfiles: number;
    flaggedCount: number;
  };
  generatedAt: number;
}

interface PerWalletAccum {
  tickets: bigint;
  spent: bigint;
  won: bigint;
  bestWin: bigint;
  resolvedPoolsTouched: Set<string>;
  poolsTouched: Set<string>;
  publicPools: Set<string>;
  privatePools: Set<string>;
  wins: number;
  rapidFireBatches: number;
}

/** Bulk-aggregate every wallet from the snapshot. */
export async function aggregateUsers(
  snap: ProtocolSnapshot,
): Promise<UsersPayload> {
  // Bucket pools by address for cheap join during batch iteration.
  const poolByAddress = new Map<string, ProtocolSnapshot["pools"][number]>();
  for (const p of snap.pools) poolByAddress.set(p.address, p);

  // Initial pass over batches → per-wallet sums.
  const accum = new Map<string, PerWalletAccum>();
  for (const b of snap.batches) {
    const pool = poolByAddress.get(b.pool);
    if (!pool) continue; // Pool not in this snapshot — skip.
    const a =
      accum.get(b.owner) ??
      ({
        tickets: 0n,
        spent: 0n,
        won: 0n,
        bestWin: 0n,
        resolvedPoolsTouched: new Set<string>(),
        poolsTouched: new Set<string>(),
        publicPools: new Set<string>(),
        privatePools: new Set<string>(),
        wins: 0,
        rapidFireBatches: 0,
      } satisfies PerWalletAccum);
    a.tickets += b.quantity;
    a.spent += b.quantity * pool.ticketPriceLamports;
    a.poolsTouched.add(b.pool);
    if (pool.kind === "public") a.publicPools.add(b.pool);
    else a.privatePools.add(b.pool);
    if (pool.state === 2) a.resolvedPoolsTouched.add(b.pool);
    accum.set(b.owner, a);
  }

  // Wins + lamports won. We iterate pools once and credit the winner.
  for (const p of snap.pools) {
    if (p.state !== 2 || !p.winner) continue;
    const a = accum.get(p.winner);
    if (!a) continue; // Winner had no batch we see (shouldn't happen but defensive).
    const creatorBps =
      p.kind === "private" ? BigInt(p.creatorFeeBps) : 0n;
    const share = computeWinnerShare(p.totalPotLamports, creatorBps);
    a.wins += 1;
    a.won += share;
    if (share > a.bestWin) a.bestWin = share;
  }

  // Friend counts in one bulk pass (no per-row Redis round-trip).
  const walletsForFriends = new Set<string>([
    ...accum.keys(),
    ...snap.profiles.keys(),
  ]);
  const friendsMap = await friendCountsByWallet(walletsForFriends);

  // Build rows: union of (any wallet with on-chain batches) + (any wallet
  // with a profile row, even if they've never bought a ticket).
  const allWallets = new Set<string>([
    ...accum.keys(),
    ...snap.profiles.keys(),
  ]);

  const rows: UserRow[] = [];
  let privateProfiles = 0;
  let publicProfiles = 0;
  let flagged = 0;
  for (const wallet of allWallets) {
    const a = accum.get(wallet);
    const profile = snap.profiles.get(wallet);
    if (profile) {
      if (profile.isPublic) publicProfiles += 1;
      else privateProfiles += 1;
    }
    const resolvedPools = a?.resolvedPoolsTouched.size ?? 0;
    const won = a?.won ?? 0n;
    const spentOnResolved = countSpendOnResolved(snap, wallet, poolByAddress);
    const netPnL = won - spentOnResolved;
    const flags = riskFlagsFor(a, profile);
    if (flags.length > 0) flagged += 1;
    rows.push({
      wallet,
      pseudo: profile?.pseudo ?? null,
      xHandle: profile?.xHandle ?? null,
      isPublic: profile?.isPublic ?? true,
      createdAtMs: profile?.createdAt ?? 0,
      tickets: (a?.tickets ?? 0n).toString(),
      spentLamports: (a?.spent ?? 0n).toString(),
      wonLamports: won.toString(),
      bestWinLamports: (a?.bestWin ?? 0n).toString(),
      resolvedPools,
      wins: a?.wins ?? 0,
      pools: a?.poolsTouched.size ?? 0,
      publicPools: a?.publicPools.size ?? 0,
      privatePools: a?.privatePools.size ?? 0,
      netPnLLamports: netPnL.toString(),
      friends: friendsMap.get(wallet) ?? 0,
      flags,
      hasProfile: !!profile,
    });
  }

  return {
    rows,
    totals: {
      totalUsersWithProfile: snap.profiles.size,
      totalUsersWithTickets: accum.size,
      privateProfiles,
      publicProfiles,
      flaggedCount: flagged,
    },
    generatedAt: snap.generatedAt,
  };
}

function countSpendOnResolved(
  snap: ProtocolSnapshot,
  wallet: string,
  poolByAddress: Map<string, ProtocolSnapshot["pools"][number]>,
): bigint {
  let total = 0n;
  for (const b of snap.batches) {
    if (b.owner !== wallet) continue;
    const pool = poolByAddress.get(b.pool);
    if (!pool || pool.state !== 2) continue;
    total += b.quantity * pool.ticketPriceLamports;
  }
  return total;
}

function riskFlagsFor(
  a: PerWalletAccum | undefined,
  profile: { wallet: string } | undefined,
): string[] {
  const flags: string[] = [];
  if (!a) return flags;
  // High-activity: >25 distinct pools.
  if (a.poolsTouched.size > 25) flags.push("HIGH_ACTIVITY");
  // Big spender lifetime: >50 SOL.
  if (a.spent > 50n * 1_000_000_000n) flags.push("BIG_SPENDER");
  // No profile claimed but heavy spend — possible bot.
  if (!profile && a.spent > 10n * 1_000_000_000n) {
    flags.push("UNCLAIMED_HIGH_SPEND");
  }
  return flags;
}

// re-export so route can also use these constants without a separate file.
export { PROTOCOL_FEE_BPS, BPS_DEN };

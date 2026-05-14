import { NextResponse } from "next/server";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { fetchPoolState } from "@/lib/raas/pool-fetch";

export interface AudienceEntry {
  wallet: string;
  /** Number of pools in which this wallet appears as winner. */
  wins: number;
  /** Approximate total tickets purchased (uses pool.total_tickets as proxy for winner-only MVP). */
  tickets: number;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const pools = await listTenantPools(slug);

  // For v1 MVP: aggregate resolved-pool winners.
  // Full per-buyer ticket-batch aggregation is expensive and deferred.
  const winMap = new Map<string, { wins: number; tickets: number }>();

  for (const p of pools) {
    const state = await fetchPoolState(p);
    if (!state) continue;
    if (state.winner) {
      const entry = winMap.get(state.winner) ?? { wins: 0, tickets: 0 };
      entry.wins += 1;
      entry.tickets += state.total_tickets;
      winMap.set(state.winner, entry);
    }
  }

  const audience: AudienceEntry[] = Array.from(winMap.entries())
    .map(([wallet, data]) => ({ wallet, ...data }))
    .sort((a, b) => b.wins - a.wins || b.tickets - a.tickets)
    .slice(0, 50);

  return NextResponse.json({ audience, total_pools: pools.length });
}

import { NextResponse } from "next/server";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { fetchPoolState } from "@/lib/raas/pool-fetch";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const pools = await listTenantPools(slug);

  let total_pot_lamports = 0n;
  let total_tickets = 0;
  let total_creator_fees_lamports = 0n;
  const buyers = new Set<string>();

  for (const p of pools) {
    const state = await fetchPoolState(p);
    if (!state) continue;
    const pot = BigInt(state.total_pot_lamports);
    total_pot_lamports += pot;
    total_tickets += state.total_tickets;
    // creator fee = pot * creator_fee_bps / 10000 (approximated; actual paid only on settle)
    total_creator_fees_lamports +=
      (pot * BigInt(state.creator_fee_bps)) / 10000n;
    if (state.winner) buyers.add(state.winner);
  }

  return NextResponse.json({
    total_pools: pools.length,
    total_pot_lamports: total_pot_lamports.toString(),
    total_tickets,
    total_creator_fees_lamports: total_creator_fees_lamports.toString(),
    unique_buyers: buyers.size,
  });
}

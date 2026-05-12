// GET /api/admin/users/:wallet
//
// Detailed view of a single wallet: lifetime totals, all
// participations (sorted by recency), cadence breakdown, friend
// lists, risk flags. Used by the user drill-down page.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { aggregateUserDetail } from "@/lib/admin/metrics/user-detail";
import { loadSnapshot } from "@/lib/admin/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ wallet: string }> },
) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { wallet } = await ctx.params;
  if (
    typeof wallet !== "string" ||
    wallet.length < 32 ||
    wallet.length > 44
  ) {
    return NextResponse.json(
      { error: "Invalid wallet pubkey." },
      { status: 400 },
    );
  }
  try {
    const snap = await loadSnapshot();
    const detail = await aggregateUserDetail(wallet, snap);
    if (!detail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unavailable." },
      { status: 503 },
    );
  }
}

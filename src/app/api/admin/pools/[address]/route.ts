// GET /api/admin/pools/:address
//
// Full per-pool detail: ledger math, participants, invite roster
// (private pools), risk flags.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { aggregatePoolDetail } from "@/lib/admin/metrics/pool-detail";
import { loadSnapshot } from "@/lib/admin/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { address } = await ctx.params;
  if (typeof address !== "string" || address.length < 32 || address.length > 44) {
    return NextResponse.json(
      { error: "Invalid pool address." },
      { status: 400 },
    );
  }
  try {
    const snap = await loadSnapshot();
    const detail = await aggregatePoolDetail(address, snap);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unavailable." },
      { status: 503 },
    );
  }
}

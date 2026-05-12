// GET /api/admin/pools
//
// Roster + per-pool aggregates for the /admin/pools page.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { aggregatePools } from "@/lib/admin/metrics/pools";
import { loadSnapshot } from "@/lib/admin/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const snap = await loadSnapshot();
    const payload = await aggregatePools(snap);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pools unavailable." },
      { status: 503 },
    );
  }
}

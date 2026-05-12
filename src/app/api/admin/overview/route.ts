// GET /api/admin/overview
//
// Returns the KPI bundle + live-pool roster for the executive overview
// page. Gated by requireAdmin. The actual aggregation work lives in
// lib/admin/metrics/overview.ts so it can be unit-tested without route
// scaffolding.
//
// Response shape: OverviewPayload (see overview.ts).

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getOverview } from "@/lib/admin/metrics/overview";

export const dynamic = "force-dynamic";
// gPA scan + balance read can take 5-15s on a cold cache; give the
// lambda room.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  try {
    const payload = await getOverview();
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Overview unavailable." },
      { status: 503 },
    );
  }
}

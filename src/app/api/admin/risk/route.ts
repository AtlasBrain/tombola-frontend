// GET /api/admin/risk
//
// Aggregated risk-flag feed. Derives entirely from the shared snapshot
// + the same per-pool / per-user heuristics those pages already use,
// so a flag here is identical to a flag on the source pages.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { aggregateRisk } from "@/lib/admin/metrics/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const payload = await aggregateRisk();
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Risk feed unavailable." },
      { status: 503 },
    );
  }
}

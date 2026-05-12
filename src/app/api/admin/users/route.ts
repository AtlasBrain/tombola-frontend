// GET /api/admin/users
//
// Returns every user row (lifetime aggregates + profile metadata).
// Filtering/sort/pagination is client-side — the row count is small
// enough (low thousands at most) that shipping the full set is cheaper
// than a chatty server-paginated API.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { aggregateUsers } from "@/lib/admin/metrics/users";
import { loadSnapshot } from "@/lib/admin/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const snap = await loadSnapshot();
    const payload = await aggregateUsers(snap);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Users unavailable." },
      { status: 503 },
    );
  }
}

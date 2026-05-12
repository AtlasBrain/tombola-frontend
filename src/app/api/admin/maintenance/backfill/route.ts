// POST /api/admin/maintenance/backfill
//
// Idempotent one-shot: iterate every existing profile and SADD its
// wallet into the `profile-created:<day>` bucket derived from
// profile.createdAt. Run once after deploying phase 4 to seed the
// historical data; later profile creations write directly via
// saveProfile().
//
// Safe to re-run — SADD is idempotent. Returns counts so the admin
// can sanity-check.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { loadSnapshot } from "@/lib/admin/snapshot";
import { recordProfileCreated } from "@/lib/activity-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const snap = await loadSnapshot();
    let backfilled = 0;
    let skipped = 0;
    for (const profile of snap.profiles.values()) {
      if (!profile.createdAt || profile.createdAt <= 0) {
        skipped += 1;
        continue;
      }
      await recordProfileCreated(profile.wallet, profile.createdAt);
      backfilled += 1;
    }
    return NextResponse.json({
      ok: true,
      backfilled,
      skipped,
      totalProfiles: snap.profiles.size,
      ranBy: gate.wallet,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed." },
      { status: 503 },
    );
  }
}

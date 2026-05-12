// GET /api/admin/cron/alert-scan
//
// Scheduled scan of the risk feed → fires webhook alerts for any
// high-severity flags that haven't already alerted within the dedupe
// window. Wired into vercel.json crons (alongside the keeper tick).
//
// Auth: SAME bearer-token pattern as the keeper. Vercel Cron injects
// Authorization: Bearer <CRON_SECRET> automatically. Local dev /
// preview without the secret can fire manually.
//
// Returns a summary so the cron log is meaningful at a glance.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { aggregateRisk } from "@/lib/admin/metrics/risk";
import { fireAlert, type AlertOutcome } from "@/lib/admin/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Match the keeper-tick auth shape so the same CRON_SECRET works for
  // both. When the secret isn't configured (local dev), allow any caller.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let scanned = 0;
  let fired = 0;
  let deduped = 0;
  let failed = 0;
  let skipped = 0;
  let errored = false;
  let errMsg: string | undefined;

  try {
    const risk = await aggregateRisk();
    scanned = risk.items.length;
    const origin = req.nextUrl.origin;
    for (const item of risk.items) {
      // Only fire for high-severity. Medium/low live in the dashboard.
      if (item.severity !== "high") {
        skipped += 1;
        continue;
      }
      const url =
        item.source === "pool"
          ? `${origin}/admin/pools/${item.subjectId}`
          : `${origin}/admin/users/${item.subjectId}`;
      const out: AlertOutcome = await fireAlert({
        id: item.id,
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        url,
      });
      if (out === "sent") fired += 1;
      else if (out === "deduped") deduped += 1;
      else if (out === "failed") failed += 1;
      else skipped += 1; // no-config / no-kv
    }
  } catch (e) {
    errored = true;
    errMsg = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: !errored,
    error: errMsg,
    scanned,
    fired,
    deduped,
    failed,
    skipped,
    ranAt: Date.now(),
  });
}

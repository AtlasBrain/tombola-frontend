// Time-series derived metrics for the admin overview.
//
// Inputs:
//   - profile.createdAt          → new-users-by-day (via daily SET)
//   - last-seen:<wallet>         → DAU/WAU/MAU
//
// Computation runs entirely off the shared snapshot.profiles + a single
// pipelined GET of last-seen-per-profile. No extra RPC. Cached at the
// overview layer (the snapshot's own 60s TTL gates this — when the
// overview KPI builder asks for fresh time-series, it's already inside
// the snapshot cache window).

import "server-only";
import {
  countProfilesCreatedForRange,
  dayKey,
  lastSeenByWallet,
} from "@/lib/activity-store";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";

export interface TimeSeriesPayload {
  /** Last 30 days of new-user counts (oldest first). */
  newUsersByDay: Array<{ day: string; count: number }>;
  /** Distinct wallets active in the trailing window. */
  dau: number;
  wau: number;
  mau: number;
  /** Sum of new users in the last N days for KPI deltas. */
  newUsers7d: number;
  newUsers30d: number;
  /** Snapshot timestamp from the underlying ProtocolSnapshot. */
  generatedAt: number;
}

const DAY_SEC = 86_400;

export async function aggregateTimeSeries(
  snap: ProtocolSnapshot,
): Promise<TimeSeriesPayload> {
  const nowSec = Math.floor(Date.now() / 1000);

  // 1) Bulk-fetch last-seen for every known profile wallet.
  const wallets = [...snap.profiles.keys()];
  const lastSeen = await lastSeenByWallet(wallets);

  let dau = 0;
  let wau = 0;
  let mau = 0;
  for (const t of lastSeen.values()) {
    if (t <= 0) continue;
    const delta = nowSec - t;
    if (delta < DAY_SEC) dau += 1;
    if (delta < 7 * DAY_SEC) wau += 1;
    if (delta < 30 * DAY_SEC) mau += 1;
  }

  // 2) New-users histogram: last 30 days, inclusive of today.
  const todayMs = Date.now();
  const endDay = dayKey(todayMs);
  const startDay = dayKey(todayMs - 29 * DAY_SEC * 1000);
  const range = await countProfilesCreatedForRange(startDay, endDay);

  let newUsers7d = 0;
  let newUsers30d = 0;
  for (let i = 0; i < range.length; i++) {
    newUsers30d += range[i].count;
    if (range.length - i <= 7) newUsers7d += range[i].count;
  }

  return {
    newUsersByDay: range,
    dau,
    wau,
    mau,
    newUsers7d,
    newUsers30d,
    generatedAt: snap.generatedAt,
  };
}

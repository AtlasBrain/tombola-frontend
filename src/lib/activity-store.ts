// Lightweight "last seen" + "new user per day" tracking.
//
// Two Redis keys:
//   last-seen:{wallet}              unix-sec timestamp (no TTL — long-
//                                   lived register so we can compute
//                                   MAU + retention curves)
//   profile-created:{YYYY-MM-DD}    SET<wallet> of profiles whose
//                                   createdAt landed on that UTC day
//
// Cost discipline: bumpLastSeen() rate-limits to one write per 5 min
// per wallet via a stored timestamp comparison. The comparison itself
// costs a GET — cheaper than a SET on the steady-state path, and
// dramatically cheaper than the write amplification we'd otherwise see
// from hot wallets pinging /api/profile/me every few seconds.

import { getRedis } from "./kv/redis";

const LAST_SEEN_PREFIX = "last-seen:";
const PROFILE_CREATED_PREFIX = "profile-created:";

/** A wallet's last-seen timestamp is refreshed at most this often. */
export const LAST_SEEN_RATE_LIMIT_SEC = 300;

/** UTC date stamp for a given unix-ms (or "today" if unset). */
export function dayKey(unixMs?: number): string {
  const d = new Date(unixMs ?? Date.now());
  // YYYY-MM-DD — locked to UTC so the bucket boundary doesn't drift
  // with the deployer's timezone.
  return d.toISOString().slice(0, 10);
}

/** Record that `wallet` was active just now. Rate-limited internally —
 *  successive calls within 5 minutes are no-ops. Safe to call from any
 *  authenticated route. Returns true if a write happened, false on
 *  skip (caller doesn't need to care). */
export async function bumpLastSeen(wallet: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  if (!isValidWalletShape(wallet)) return false;
  const key = `${LAST_SEEN_PREFIX}${wallet}`;
  const nowSec = Math.floor(Date.now() / 1000);
  // The stored value is a stringified unix-sec. Parse defensively.
  const raw = await r.get<number | string | null>(key);
  const prev = typeof raw === "number" ? raw : raw ? Number(raw) : 0;
  if (Number.isFinite(prev) && nowSec - prev < LAST_SEEN_RATE_LIMIT_SEC) {
    return false;
  }
  await r.set(key, nowSec);
  return true;
}

/** Read last-seen for one wallet. Returns unix-sec, or 0 if never
 *  seen. Used by the admin user-detail page. */
export async function getLastSeen(wallet: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const raw = await r.get<number | string | null>(
    `${LAST_SEEN_PREFIX}${wallet}`,
  );
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw) || 0;
  return 0;
}

/** Add a wallet to the "created on this day" SET. Idempotent — the SET
 *  shape means re-adding an existing wallet is a no-op. */
export async function recordProfileCreated(
  wallet: string,
  createdAtMs: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  if (!isValidWalletShape(wallet)) return;
  const key = `${PROFILE_CREATED_PREFIX}${dayKey(createdAtMs)}`;
  await r.sadd(key, wallet);
}

/** Count members of the SET for a given UTC day. Returns 0 if missing
 *  or KV unavailable. */
export async function countProfilesCreatedOn(day: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const n = await r.scard(`${PROFILE_CREATED_PREFIX}${day}`);
  return Number(n ?? 0);
}

/** Bulk fetch counts for a date range (admin charts). Inclusive of both
 *  ends. Days are returned in chronological order. */
export async function countProfilesCreatedForRange(
  startDay: string,
  endDay: string,
): Promise<Array<{ day: string; count: number }>> {
  const days = enumerateDays(startDay, endDay);
  if (days.length === 0) return [];
  const r = getRedis();
  if (!r) return days.map((day) => ({ day, count: 0 }));
  const pipe = r.pipeline();
  for (const day of days) pipe.scard(`${PROFILE_CREATED_PREFIX}${day}`);
  const counts = (await pipe.exec()) as Array<number | null | undefined>;
  return days.map((day, i) => ({
    day,
    count: Number(counts[i] ?? 0),
  }));
}

/** Bulk fetch last-seen for many wallets. Pipeline once. */
export async function lastSeenByWallet(
  wallets: Iterable<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const list = [...wallets];
  if (list.length === 0) return out;
  const r = getRedis();
  if (!r) return out;
  const pipe = r.pipeline();
  for (const w of list) pipe.get(`${LAST_SEEN_PREFIX}${w}`);
  const results = (await pipe.exec()) as Array<number | string | null>;
  for (let i = 0; i < list.length; i++) {
    const v = results[i];
    out.set(list[i], typeof v === "number" ? v : v ? Number(v) || 0 : 0);
  }
  return out;
}

function isValidWalletShape(s: string): boolean {
  return typeof s === "string" && s.length >= 32 && s.length <= 44;
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  const s = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const e = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return out;
  for (let t = s; t <= e; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

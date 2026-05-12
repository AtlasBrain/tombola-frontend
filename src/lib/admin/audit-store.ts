// Admin-action audit log.
//
// Every successful /api/admin/* request lands one row. The store is
// append-only and partitioned by UTC day so retention is straightforward
// (one ZSET per day, TTL'd at write time).
//
// Schema:
//   audit:<YYYY-MM-DD>           ZSET<json-event>, score = unix-ms
//
// Why ZSET-by-day instead of a single global ZSET:
//   - Bounded growth per key; trivial retention.
//   - Reads at the day granularity are cheap and natural.
//   - Cross-day queries fan out one read per day in the range —
//     still cheap at admin-scale (single-digit hits/minute).
//
// The serialized member is a JSON string of AuditEvent. Two concurrent
// writes at the same ms with the same wallet+route would collide on a
// pure-set semantics; we de-duplicate by appending a 12-char random
// salt to each event so collisions are statistically impossible.

import "server-only";
import { getRedis } from "@/lib/kv/redis";

const AUDIT_PREFIX = "audit:";
/** Per-day TTL. 90 days is enough to spot rotation patterns + comply
 *  with a typical operator-audit retention without growing forever. */
export const AUDIT_TTL_SEC = 90 * 24 * 60 * 60;

export interface AuditEvent {
  ts: number; // unix ms
  wallet: string; // admin who made the call
  method: string; // GET | POST | DELETE
  /** Path WITHOUT query string. */
  path: string;
  /** HTTP status returned to the caller. */
  status: number;
  /** Optional structured detail — used by maintenance routes to log
   *  what they actually did. */
  meta?: Record<string, unknown>;
  /** Random salt to make duplicates statistically impossible at the
   *  member-uniqueness level. */
  salt: string;
}

function dayKeyForMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function randomSalt(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Write one event. Best-effort — swallows KV errors so audit failure
 *  never breaks the routes it's observing. Returns the persisted
 *  event so callers can also stash it in logs. */
export async function recordAuditEvent(
  event: Omit<AuditEvent, "ts" | "salt">,
): Promise<AuditEvent | null> {
  const r = getRedis();
  if (!r) return null;
  const ts = Date.now();
  const full: AuditEvent = { ...event, ts, salt: randomSalt() };
  const key = `${AUDIT_PREFIX}${dayKeyForMs(ts)}`;
  try {
    await r.zadd(key, { score: ts, member: JSON.stringify(full) });
    // Set TTL on first write per day; idempotent EXPIRE is fine here
    // (Upstash supports it). Skip-failure if Redis driver does not.
    if ("expire" in r) {
      try {
        await (r as { expire(k: string, s: number): Promise<unknown> }).expire(
          key,
          AUDIT_TTL_SEC,
        );
      } catch {
        // expire is best-effort
      }
    }
  } catch {
    return null;
  }
  return full;
}

export interface ListAuditOpts {
  /** Inclusive lower-bound unix ms. Defaults to now − 24h. */
  fromMs?: number;
  /** Inclusive upper-bound unix ms. Defaults to now. */
  toMs?: number;
  /** Max events to return. Default 200, hard cap 1000. */
  limit?: number;
  /** Only return events for this wallet. */
  wallet?: string;
  /** Only return events whose path includes this substring. */
  pathContains?: string;
  /** Only return events with this HTTP status (e.g. 401 to audit
   *  rejected calls). */
  status?: number;
}

/** Read audit events across a date range. Always sorted ascending by
 *  timestamp — caller can `.reverse()` for newest-first display. */
export async function listAuditEvents(
  opts: ListAuditOpts = {},
): Promise<AuditEvent[]> {
  const r = getRedis();
  if (!r) return [];
  const toMs = opts.toMs ?? Date.now();
  const fromMs = opts.fromMs ?? toMs - 24 * 60 * 60 * 1000;
  if (fromMs > toMs) return [];
  const limit = Math.min(opts.limit ?? 200, 1000);

  // Enumerate day buckets covered by the window. fromMs/toMs are unix-ms.
  const days = enumerateDays(fromMs, toMs);
  if (days.length === 0) return [];

  // Each day read can fire in parallel — they're independent ZSETs.
  const slices = await Promise.all(
    days.map(async (day) => {
      try {
        return (await r.zrange(`${AUDIT_PREFIX}${day}`, fromMs, toMs, {
          byScore: true,
        })) as string[];
      } catch {
        return [];
      }
    }),
  );

  const out: AuditEvent[] = [];
  for (const slice of slices) {
    for (const member of slice) {
      try {
        const ev = JSON.parse(member) as AuditEvent;
        if (!filterMatches(ev, opts)) continue;
        out.push(ev);
        if (out.length >= limit) break;
      } catch {
        // Skip malformed.
      }
    }
    if (out.length >= limit) break;
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function filterMatches(ev: AuditEvent, opts: ListAuditOpts): boolean {
  if (opts.wallet && ev.wallet !== opts.wallet) return false;
  if (opts.pathContains && !ev.path.includes(opts.pathContains)) return false;
  if (typeof opts.status === "number" && ev.status !== opts.status) return false;
  return true;
}

function enumerateDays(fromMs: number, toMs: number): string[] {
  if (fromMs > toMs) return [];
  const out: string[] = [];
  // Walk by day in UTC. Start at the UTC midnight that contains fromMs.
  const startUtc = Date.UTC(
    new Date(fromMs).getUTCFullYear(),
    new Date(fromMs).getUTCMonth(),
    new Date(fromMs).getUTCDate(),
  );
  for (let t = startUtc; t <= toMs; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

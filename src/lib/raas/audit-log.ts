// src/lib/raas/audit-log.ts — Operator audit log helpers.
//
// Each entry stored at raas:audit:<uuid>.
// Index: raas:audit:index (Redis list, lpush + ltrim to 10k).
//
// Design deviation: uses crypto.randomUUID() instead of ULID because no ULID
// library is in deps. UUIDs are random (not time-sortable), so the index order
// is insertion-order (lpush = newest-first), which gives the same browse UX.
// Documented in DESIGN_DECISIONS.md (D-072).
import "server-only";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export interface AuditEntry {
  id: string;
  actor_wallet: string;
  action: string;
  target_slug: string;
  before: unknown;
  after: unknown;
  reason: string;
  ts: string;
}

export async function logAudit(
  entry: Omit<AuditEntry, "id" | "ts">,
): Promise<void> {
  const id = crypto.randomUUID();
  const full: AuditEntry = { ...entry, id, ts: new Date().toISOString() };
  await redis.set(`raas:audit:${id}`, full);
  await redis.lpush("raas:audit:index", id);
  await redis.ltrim("raas:audit:index", 0, 9999); // keep last 10k entries
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const ids = await redis.lrange<string>("raas:audit:index", 0, limit - 1);
  const out: AuditEntry[] = [];
  for (const id of ids) {
    const entry = await redis.get<AuditEntry>(`raas:audit:${id}`);
    if (entry) out.push(entry);
  }
  return out;
}

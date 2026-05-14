// src/lib/raas/schedule.ts — recurring-raffle schedule CRUD + due-queue helpers.
import "server-only";
import { Redis } from "@upstash/redis";
import type { Schedule } from "@/types/raas";

const redis = Redis.fromEnv();

const SCHEDULE_KEY = (id: string) => `raas:schedule:${id}`;
const TENANT_SCHEDULES_KEY = (slug: string) => `raas:tenant:${slug}:schedules`;
/** Sorted set: member = schedule_id, score = next_run_at unix-ms */
const DUE_SCHEDULES_KEY = "raas:schedules:due";

// ── computeNextRunAt ──────────────────────────────────────────────────────────

/**
 * Returns the next wall-clock moment (UTC) that satisfies the cadence config,
 * strictly after `ref`. All arithmetic uses getUTC* to avoid local-timezone
 * drift (important: never use getDay() here).
 */
export function computeNextRunAt(
  cadence: Pick<Schedule, "cadence" | "day_of_week" | "hour_utc">,
  ref: Date = new Date(),
): Date {
  switch (cadence.cadence) {
    case "daily": {
      // Try today at target hour; if that's <= ref, advance one day.
      const candidate = new Date(
        Date.UTC(
          ref.getUTCFullYear(),
          ref.getUTCMonth(),
          ref.getUTCDate(),
          cadence.hour_utc,
          0,
          0,
          0,
        ),
      );
      if (candidate <= ref) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
      return candidate;
    }

    case "weekly":
    case "biweekly": {
      const target = cadence.day_of_week!;
      // Start from today at target hour.
      const candidate = new Date(
        Date.UTC(
          ref.getUTCFullYear(),
          ref.getUTCMonth(),
          ref.getUTCDate(),
          cadence.hour_utc,
          0,
          0,
          0,
        ),
      );
      // Advance until we hit the target weekday.
      while (candidate.getUTCDay() !== target) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
      // If that moment is not strictly after ref, add 7 days (or 14 for biweekly).
      if (candidate <= ref) {
        const delta = cadence.cadence === "biweekly" ? 14 : 7;
        candidate.setUTCDate(candidate.getUTCDate() + delta);
      }
      return candidate;
    }

    case "monthly": {
      // Target: 1st of month at target hour.
      const candidate = new Date(
        Date.UTC(
          ref.getUTCFullYear(),
          ref.getUTCMonth(),
          1,
          cadence.hour_utc,
          0,
          0,
          0,
        ),
      );
      if (candidate <= ref) {
        candidate.setUTCMonth(candidate.getUTCMonth() + 1);
      }
      return candidate;
    }
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createSchedule(
  input: Omit<Schedule, "schedule_id" | "next_run_at" | "status" | "run_count">,
): Promise<Schedule> {
  const schedule_id = crypto.randomUUID();
  const nextDate = computeNextRunAt(input);
  const next_run_at = nextDate.toISOString();

  const schedule: Schedule = {
    ...input,
    schedule_id,
    next_run_at,
    status: "active",
    run_count: 0,
  };

  await redis.set(SCHEDULE_KEY(schedule_id), schedule);

  // Append to tenant's schedule list.
  const tenantList =
    (await redis.get<string[]>(TENANT_SCHEDULES_KEY(input.tenant_slug))) ?? [];
  tenantList.push(schedule_id);
  await redis.set(TENANT_SCHEDULES_KEY(input.tenant_slug), tenantList);

  // Insert into the due sorted set.
  await redis.zadd(DUE_SCHEDULES_KEY, {
    score: nextDate.getTime(),
    member: schedule_id,
  });

  return schedule;
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  return await redis.get<Schedule>(SCHEDULE_KEY(id));
}

export async function listTenantSchedules(slug: string): Promise<Schedule[]> {
  const ids =
    (await redis.get<string[]>(TENANT_SCHEDULES_KEY(slug))) ?? [];
  if (ids.length === 0) return [];
  const out: Schedule[] = [];
  for (const id of ids) {
    const s = await getSchedule(id);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Bumps run_count and advances next_run_at by one cadence interval.
 * Also updates the sorted-set score so the schedule won't fire again until
 * the new next_run_at.
 */
export async function advanceSchedule(id: string): Promise<void> {
  const s = await getSchedule(id);
  if (!s) return;
  // Compute next from the current next_run_at (not from now) so the schedule
  // stays locked to its original cadence anchor, not wall-clock drift.
  const nextDate = computeNextRunAt(s, new Date(s.next_run_at));
  s.next_run_at = nextDate.toISOString();
  s.run_count += 1;
  await redis.set(SCHEDULE_KEY(id), s);
  await redis.zadd(DUE_SCHEDULES_KEY, { score: nextDate.getTime(), member: id });
}

/**
 * Returns all active schedules whose next_run_at <= now.
 * Uses the sorted set for O(log N + K) lookup.
 */
export async function listDueSchedules(now: Date = new Date()): Promise<Schedule[]> {
  // zrange with byScore returns members with score in [0, now.getTime()].
  const ids = (await redis.zrange(DUE_SCHEDULES_KEY, 0, now.getTime(), {
    byScore: true,
  })) as string[];

  const out: Schedule[] = [];
  for (const id of ids) {
    const s = await getSchedule(id);
    if (s && s.status === "active") out.push(s);
  }
  return out;
}

// src/lib/raas/schedule.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted: store is safe to reference from vi.mock factory
const { _store, _zsets } = vi.hoisted(() => ({
  _store: new Map<string, unknown>(),
  _zsets: new Map<string, Map<string, number>>(),
}));

vi.mock("@upstash/redis", () => {
  const instance = {
    get: vi.fn(async (k: string) => (_store.get(k) as unknown) ?? null),
    set: vi.fn(async (k: string, v: unknown) => {
      _store.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (k: string) => (_store.delete(k) ? 1 : 0)),
    zadd: vi.fn(
      async (key: string, opts: { score: number; member: string }) => {
        if (!_zsets.has(key)) _zsets.set(key, new Map());
        _zsets.get(key)!.set(opts.member, opts.score);
        return 1;
      },
    ),
    zrange: vi.fn(
      async (
        key: string,
        min: number,
        max: number,
        opts?: { byScore?: boolean },
      ) => {
        if (!opts?.byScore) return [];
        const set = _zsets.get(key);
        if (!set) return [];
        const results: string[] = [];
        for (const [member, score] of set.entries()) {
          if (score >= min && score <= max) results.push(member);
        }
        return results;
      },
    ),
  };
  const RedisMock = vi.fn().mockImplementation(() => instance);
  (RedisMock as unknown as Record<string, unknown>).fromEnv = vi.fn(
    () => instance,
  );
  return { Redis: RedisMock };
});

import {
  computeNextRunAt,
  createSchedule,
  getSchedule,
  listTenantSchedules,
  advanceSchedule,
  listDueSchedules,
} from "./schedule.js";

beforeEach(() => {
  _store.clear();
  _zsets.clear();
});

// ── computeNextRunAt ─────────────────────────────────────────────────────────

describe("computeNextRunAt", () => {
  it("weekly: next Friday (day=5) at 18:00 UTC from a Wednesday anchor", () => {
    // 2026-05-13 is a Wednesday (getUTCDay() === 3). Next Friday = 2026-05-15.
    const ref = new Date("2026-05-13T10:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "weekly", day_of_week: 5, hour_utc: 18 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-15T18:00:00.000Z");
  });

  it("weekly: same day but later hour → same day, not +7", () => {
    // 2026-05-15 is a Friday; ref hour is 10, target is 18 → same day
    const ref = new Date("2026-05-15T10:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "weekly", day_of_week: 5, hour_utc: 18 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-15T18:00:00.000Z");
  });

  it("weekly: UTC boundary — ref is Thu UTC but Fri local; next Sat must be computed in UTC", () => {
    // 2026-05-14T22:30Z = UTC Thursday (getUTCDay=4), Dubai Friday (getDay=5).
    // Asking for next Saturday (day=6, hour=0 UTC).
    // Correct answer: 2026-05-16T00:00:00.000Z (Sat UTC).
    // With getDay() bug: would land on 2026-05-15T20:00Z (local Sat = UTC Fri) → WRONG.
    const ref = new Date("2026-05-14T22:30:00.000Z");
    const next = computeNextRunAt(
      { cadence: "weekly", day_of_week: 6, hour_utc: 0 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-16T00:00:00.000Z");
  });

  it("weekly: same day but past the hour → next week", () => {
    // ref is Friday 19:00, target hour is 18 → missed today, so next Friday
    const ref = new Date("2026-05-15T19:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "weekly", day_of_week: 5, hour_utc: 18 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-22T18:00:00.000Z");
  });

  it("daily: tomorrow at given hour when ref is past that hour today", () => {
    const ref = new Date("2026-05-13T22:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "daily", day_of_week: null, hour_utc: 6 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-14T06:00:00.000Z");
  });

  it("daily: same day when ref is before the target hour", () => {
    const ref = new Date("2026-05-13T04:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "daily", day_of_week: null, hour_utc: 6 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-05-13T06:00:00.000Z");
  });

  it("monthly: next 1st of month at hour when currently mid-month", () => {
    const ref = new Date("2026-05-13T10:00:00.000Z");
    const next = computeNextRunAt(
      { cadence: "monthly", day_of_week: null, hour_utc: 0 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("monthly: same month 1st when ref is before the hour on the 1st", () => {
    const ref = new Date("2026-06-01T00:00:00.000Z"); // exactly on the mark
    // ref equals the candidate → must advance to next month
    const next = computeNextRunAt(
      { cadence: "monthly", day_of_week: null, hour_utc: 0 },
      ref,
    );
    expect(next.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

// ── createSchedule ────────────────────────────────────────────────────────────

describe("createSchedule", () => {
  it("persists a schedule with generated id, status=active, run_count=0", async () => {
    const s = await createSchedule({
      tenant_slug: "acme",
      cadence: "weekly",
      day_of_week: 5,
      hour_utc: 18,
      template: {
        name_template: "Acme Weekly #{n}",
        ticket_price_lamports: 50_000_000,
        duration_seconds: 86400,
        creator_fee_bps: 1500,
        gating_mode: "public",
        invite_count: null,
      },
    });

    expect(s.schedule_id).toBeTruthy();
    expect(s.status).toBe("active");
    expect(s.run_count).toBe(0);
    expect(s.next_run_at).toBeTruthy();
    expect(new Date(s.next_run_at).getUTCDay()).toBe(5); // must be a Friday
  });

  it("adds the schedule to the tenant schedule list", async () => {
    await createSchedule({
      tenant_slug: "beta",
      cadence: "daily",
      day_of_week: null,
      hour_utc: 9,
      template: {
        name_template: "Daily #{n}",
        ticket_price_lamports: 10_000_000,
        duration_seconds: 3600,
        creator_fee_bps: 500,
        gating_mode: "public",
        invite_count: null,
      },
    });
    const list = await listTenantSchedules("beta");
    expect(list).toHaveLength(1);
    expect(list[0].cadence).toBe("daily");
  });
});

// ── getSchedule ───────────────────────────────────────────────────────────────

describe("getSchedule", () => {
  it("returns null for unknown id", async () => {
    const s = await getSchedule("nonexistent");
    expect(s).toBeNull();
  });

  it("round-trips through KV", async () => {
    const created = await createSchedule({
      tenant_slug: "gamma",
      cadence: "monthly",
      day_of_week: null,
      hour_utc: 12,
      template: {
        name_template: "Monthly #{n}",
        ticket_price_lamports: 100_000_000,
        duration_seconds: 604800,
        creator_fee_bps: 2000,
        gating_mode: "public",
        invite_count: null,
      },
    });
    const fetched = await getSchedule(created.schedule_id);
    expect(fetched).toMatchObject({ schedule_id: created.schedule_id, cadence: "monthly" });
  });
});

// ── advanceSchedule ───────────────────────────────────────────────────────────

describe("advanceSchedule", () => {
  it("increments run_count and updates next_run_at", async () => {
    const s = await createSchedule({
      tenant_slug: "delta",
      cadence: "weekly",
      day_of_week: 1, // Monday
      hour_utc: 10,
      template: {
        name_template: "Weekly #{n}",
        ticket_price_lamports: 50_000_000,
        duration_seconds: 86400,
        creator_fee_bps: 1500,
        gating_mode: "public",
        invite_count: null,
      },
    });
    const originalNext = s.next_run_at;
    await advanceSchedule(s.schedule_id);
    const updated = await getSchedule(s.schedule_id);
    expect(updated!.run_count).toBe(1);
    // next_run_at must be strictly later than the original
    expect(new Date(updated!.next_run_at) > new Date(originalNext)).toBe(true);
  });
});

// ── listDueSchedules ──────────────────────────────────────────────────────────

describe("listDueSchedules", () => {
  it("returns schedules whose next_run_at <= now", async () => {
    // Create a schedule, then manually set its next_run_at to the past
    // by creating with a ref date far in the future so that computeNextRunAt
    // puts it in the past relative to our 'now' argument.
    const s = await createSchedule({
      tenant_slug: "epsilon",
      cadence: "daily",
      day_of_week: null,
      hour_utc: 0,
      template: {
        name_template: "Daily #{n}",
        ticket_price_lamports: 10_000_000,
        duration_seconds: 3600,
        creator_fee_bps: 500,
        gating_mode: "public",
        invite_count: null,
      },
    });
    // Manually force next_run_at to the past in the mock store
    const stored = _store.get(`raas:schedule:${s.schedule_id}`) as typeof s;
    stored.next_run_at = "2020-01-01T00:00:00.000Z";
    _store.set(`raas:schedule:${s.schedule_id}`, stored);
    // Also update the sorted-set score
    const key = "raas:schedules:due";
    if (!_zsets.has(key)) _zsets.set(key, new Map());
    _zsets.get(key)!.set(s.schedule_id, new Date("2020-01-01T00:00:00.000Z").getTime());

    const now = new Date("2026-01-01T00:00:00.000Z");
    const due = await listDueSchedules(now);
    expect(due.some((d) => d.schedule_id === s.schedule_id)).toBe(true);
  });

  it("does not return paused schedules", async () => {
    const s = await createSchedule({
      tenant_slug: "zeta",
      cadence: "daily",
      day_of_week: null,
      hour_utc: 0,
      template: {
        name_template: "Daily #{n}",
        ticket_price_lamports: 10_000_000,
        duration_seconds: 3600,
        creator_fee_bps: 500,
        gating_mode: "public",
        invite_count: null,
      },
    });
    // Force to past + paused
    const stored = _store.get(`raas:schedule:${s.schedule_id}`) as typeof s;
    stored.next_run_at = "2020-01-01T00:00:00.000Z";
    stored.status = "paused";
    _store.set(`raas:schedule:${s.schedule_id}`, stored);
    const key = "raas:schedules:due";
    if (!_zsets.has(key)) _zsets.set(key, new Map());
    _zsets.get(key)!.set(s.schedule_id, new Date("2020-01-01T00:00:00.000Z").getTime());

    const due = await listDueSchedules(new Date("2026-01-01T00:00:00.000Z"));
    expect(due.some((d) => d.schedule_id === s.schedule_id)).toBe(false);
  });
});

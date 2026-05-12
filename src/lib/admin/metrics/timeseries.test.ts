import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "@/lib/__mocks__/fake-redis";

const fake = new FakeRedis();
vi.mock("@/lib/kv/redis", () => ({
  getRedis: () => fake,
}));

import { aggregateTimeSeries } from "./timeseries";
import type { ProtocolSnapshot } from "@/lib/admin/snapshot";
import { dayKey } from "@/lib/activity-store";

const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CARL = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
});

/** Build a minimum ProtocolSnapshot with just the profile keyset
 *  populated — the time-series aggregator never reads pools/batches. */
function snapFor(wallets: string[]): ProtocolSnapshot {
  const profiles = new Map<string, ProtocolSnapshot["profiles"] extends Map<string, infer V> ? V : never>();
  for (const w of wallets) {
    profiles.set(w, {
      wallet: w,
      pseudo: null,
      xHandle: null,
      isPublic: true,
      createdAt: 0,
    });
  }
  return {
    pools: [],
    batches: [],
    profiles,
    treasury: null,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

describe("aggregateTimeSeries", () => {
  it("returns zeros when no profiles exist", async () => {
    const out = await aggregateTimeSeries(snapFor([]));
    expect(out.dau).toBe(0);
    expect(out.wau).toBe(0);
    expect(out.mau).toBe(0);
    expect(out.newUsers7d).toBe(0);
    expect(out.newUsers30d).toBe(0);
    expect(out.newUsersByDay).toHaveLength(30);
  });

  it("buckets last-seen into DAU / WAU / MAU correctly", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    fake.store.set("last-seen:" + ALICE, nowSec - 60); // 1m ago → DAU
    fake.store.set("last-seen:" + BOB, nowSec - 3 * 86_400); // 3d ago → WAU+MAU
    fake.store.set("last-seen:" + CARL, nowSec - 20 * 86_400); // 20d ago → MAU only
    const out = await aggregateTimeSeries(snapFor([ALICE, BOB, CARL]));
    expect(out.dau).toBe(1);
    expect(out.wau).toBe(2);
    expect(out.mau).toBe(3);
  });

  it("ignores zero / missing last-seen timestamps", async () => {
    // ALICE has a profile but never auth'd — not counted.
    const out = await aggregateTimeSeries(snapFor([ALICE]));
    expect(out.dau).toBe(0);
    expect(out.wau).toBe(0);
    expect(out.mau).toBe(0);
  });

  it("computes new-users-by-day from the SET buckets", async () => {
    const todayMs = Date.now();
    const today = dayKey(todayMs);
    const yesterday = dayKey(todayMs - 86_400_000);
    fake.sets.set(`profile-created:${today}`, new Set([ALICE, BOB]));
    fake.sets.set(`profile-created:${yesterday}`, new Set([CARL]));

    const out = await aggregateTimeSeries(snapFor([ALICE, BOB, CARL]));
    expect(out.newUsers30d).toBe(3);
    expect(out.newUsers7d).toBe(3); // all within last 7 days
    // Day series is 30 entries, chronological, ending today.
    expect(out.newUsersByDay).toHaveLength(30);
    expect(out.newUsersByDay[out.newUsersByDay.length - 1]).toEqual({
      day: today,
      count: 2,
    });
    expect(out.newUsersByDay[out.newUsersByDay.length - 2]).toEqual({
      day: yesterday,
      count: 1,
    });
  });

  it("separates 7d from 30d totals correctly", async () => {
    const todayMs = Date.now();
    const oldDay = dayKey(todayMs - 15 * 86_400_000); // 15 days ago
    fake.sets.set(`profile-created:${oldDay}`, new Set([ALICE]));
    const today = dayKey(todayMs);
    fake.sets.set(`profile-created:${today}`, new Set([BOB]));

    const out = await aggregateTimeSeries(snapFor([ALICE, BOB]));
    expect(out.newUsers30d).toBe(2);
    expect(out.newUsers7d).toBe(1); // only BOB is within last 7 days
  });
});

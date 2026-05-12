import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

const fake = new FakeRedis();
vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

import {
  LAST_SEEN_RATE_LIMIT_SEC,
  bumpLastSeen,
  countProfilesCreatedForRange,
  countProfilesCreatedOn,
  dayKey,
  getLastSeen,
  lastSeenByWallet,
  recordProfileCreated,
} from "./activity-store";

const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CARL = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.zsets.clear();
});

describe("dayKey", () => {
  it("formats UTC YYYY-MM-DD", () => {
    expect(dayKey(Date.UTC(2026, 4, 12, 14, 30, 0))).toBe("2026-05-12");
  });

  it("locks to UTC even at the boundary", () => {
    // 2026-05-13 00:00:00Z is the SAME instant as 2026-05-12 23:00 in Vienna.
    // We always pick the UTC day.
    expect(dayKey(Date.UTC(2026, 4, 13, 0, 0, 0))).toBe("2026-05-13");
    expect(dayKey(Date.UTC(2026, 4, 12, 23, 59, 59))).toBe("2026-05-12");
  });

  it("defaults to current time when no arg", () => {
    expect(dayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("bumpLastSeen", () => {
  it("writes a fresh timestamp the first time", async () => {
    const wrote = await bumpLastSeen(ALICE);
    expect(wrote).toBe(true);
    const seen = await getLastSeen(ALICE);
    expect(seen).toBeGreaterThan(0);
  });

  it("rejects malformed wallet pubkeys", async () => {
    expect(await bumpLastSeen("")).toBe(false);
    expect(await bumpLastSeen("tooshort")).toBe(false);
    expect(await bumpLastSeen("x".repeat(50))).toBe(false);
  });

  it("rate-limits inside the cooldown window", async () => {
    const now = Math.floor(Date.now() / 1000);
    fake.store.set(`last-seen:${ALICE}`, now);
    const wrote = await bumpLastSeen(ALICE);
    expect(wrote).toBe(false);
    // Still the same value.
    expect(await getLastSeen(ALICE)).toBe(now);
  });

  it("writes again once the cooldown elapses", async () => {
    const old = Math.floor(Date.now() / 1000) - LAST_SEEN_RATE_LIMIT_SEC - 10;
    fake.store.set(`last-seen:${ALICE}`, old);
    const wrote = await bumpLastSeen(ALICE);
    expect(wrote).toBe(true);
    expect(await getLastSeen(ALICE)).toBeGreaterThan(old);
  });

  it("tolerates string-typed stored values (Redis Upstash quirk)", async () => {
    const now = Math.floor(Date.now() / 1000);
    fake.store.set(`last-seen:${ALICE}`, String(now));
    expect(await bumpLastSeen(ALICE)).toBe(false);
  });

  it("does not write when KV is unavailable", async () => {
    // Replace getRedis to return null for this single test.
    const mod = await import("./kv/redis");
    const orig = mod.getRedis;
    const m = mod as unknown as { getRedis: () => unknown };
    m.getRedis = () => null;
    try {
      expect(await bumpLastSeen(ALICE)).toBe(false);
    } finally {
      m.getRedis = orig;
    }
  });
});

describe("lastSeenByWallet (bulk)", () => {
  it("returns 0 for unseen wallets", async () => {
    const m = await lastSeenByWallet([ALICE, BOB]);
    expect(m.get(ALICE)).toBe(0);
    expect(m.get(BOB)).toBe(0);
  });

  it("returns timestamps for seen wallets and 0 for missing", async () => {
    fake.store.set(`last-seen:${ALICE}`, 1700000000);
    fake.store.set(`last-seen:${CARL}`, 1700000100);
    const m = await lastSeenByWallet([ALICE, BOB, CARL]);
    expect(m.get(ALICE)).toBe(1700000000);
    expect(m.get(BOB)).toBe(0);
    expect(m.get(CARL)).toBe(1700000100);
  });

  it("returns empty map for empty input", async () => {
    expect((await lastSeenByWallet([])).size).toBe(0);
  });
});

describe("recordProfileCreated + countProfilesCreatedOn", () => {
  it("buckets a profile into its UTC day", async () => {
    await recordProfileCreated(ALICE, Date.UTC(2026, 4, 12, 12, 0, 0));
    expect(await countProfilesCreatedOn("2026-05-12")).toBe(1);
    expect(await countProfilesCreatedOn("2026-05-11")).toBe(0);
  });

  it("is idempotent — re-adding the same wallet doesn't double-count", async () => {
    await recordProfileCreated(ALICE, Date.UTC(2026, 4, 12));
    await recordProfileCreated(ALICE, Date.UTC(2026, 4, 12));
    expect(await countProfilesCreatedOn("2026-05-12")).toBe(1);
  });

  it("distinct wallets accumulate into the same day bucket", async () => {
    const ts = Date.UTC(2026, 4, 12);
    await recordProfileCreated(ALICE, ts);
    await recordProfileCreated(BOB, ts);
    await recordProfileCreated(CARL, ts);
    expect(await countProfilesCreatedOn("2026-05-12")).toBe(3);
  });

  it("skips malformed wallets", async () => {
    await recordProfileCreated("nope", Date.UTC(2026, 4, 12));
    expect(await countProfilesCreatedOn("2026-05-12")).toBe(0);
  });
});

describe("countProfilesCreatedForRange", () => {
  it("returns each day in chronological order", async () => {
    await recordProfileCreated(ALICE, Date.UTC(2026, 4, 12));
    await recordProfileCreated(BOB, Date.UTC(2026, 4, 13));
    await recordProfileCreated(CARL, Date.UTC(2026, 4, 13));
    const series = await countProfilesCreatedForRange("2026-05-11", "2026-05-14");
    expect(series).toEqual([
      { day: "2026-05-11", count: 0 },
      { day: "2026-05-12", count: 1 },
      { day: "2026-05-13", count: 2 },
      { day: "2026-05-14", count: 0 },
    ]);
  });

  it("handles a single-day range", async () => {
    await recordProfileCreated(ALICE, Date.UTC(2026, 4, 12));
    const series = await countProfilesCreatedForRange("2026-05-12", "2026-05-12");
    expect(series).toEqual([{ day: "2026-05-12", count: 1 }]);
  });

  it("returns empty when end is before start", async () => {
    expect(
      await countProfilesCreatedForRange("2026-05-13", "2026-05-12"),
    ).toEqual([]);
  });
});

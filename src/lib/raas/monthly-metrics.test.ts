// src/lib/raas/monthly-metrics.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before vi.mock factories — safe to reference from the factory.
const { _store } = vi.hoisted(() => ({
  _store: new Map<string, unknown>(),
}));

vi.mock("@upstash/redis", () => {
  const instance = {
    get: vi.fn(async (k: string) => (_store.get(k) as unknown) ?? null),
    set: vi.fn(async (k: string, v: unknown) => {
      _store.set(k, v);
      return "OK";
    }),
    setnx: vi.fn(async (k: string, v: unknown) => {
      if (_store.has(k)) return 0;
      _store.set(k, v);
      return 1;
    }),
    del: vi.fn(async (k: string) => (_store.delete(k) ? 1 : 0)),
  };
  const RedisMock = vi.fn().mockImplementation(() => instance);
  (RedisMock as unknown as Record<string, unknown>).fromEnv = vi.fn(
    () => instance,
  );
  return { Redis: RedisMock };
});

import {
  getMonthlyMetrics,
  addToMonthlyMetrics,
  currentYearMonth,
} from "./monthly-metrics.js";

beforeEach(() => {
  _store.clear();
});

describe("currentYearMonth", () => {
  it("returns an 6-char YYYYMM string", () => {
    const ym = currentYearMonth();
    expect(ym).toMatch(/^\d{6}$/);
  });

  it("matches today UTC month", () => {
    const ym = currentYearMonth();
    const d = new Date();
    const expected = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(ym).toBe(expected);
  });
});

describe("getMonthlyMetrics", () => {
  it("returns zeroed defaults for unknown slug/ym", async () => {
    const m = await getMonthlyMetrics("no-tenant", "202601");
    expect(m.pot_volume_lamports).toBe("0");
    expect(m.ticket_count).toBe(0);
    expect(m.pool_count).toBe(0);
    expect(m.protocol_fees_lamports).toBe("0");
  });

  it("round-trips stored values", async () => {
    // Manually store a value to verify retrieval.
    _store.set("raas:tenant:acme:metrics:202601", {
      pot_volume_lamports: "500000000000",
      ticket_count: 42,
      pool_count: 3,
      protocol_fees_lamports: "5000000000",
    });
    const m = await getMonthlyMetrics("acme", "202601");
    expect(m.pot_volume_lamports).toBe("500000000000");
    expect(m.ticket_count).toBe(42);
    expect(m.pool_count).toBe(3);
    expect(m.protocol_fees_lamports).toBe("5000000000");
  });
});

describe("addToMonthlyMetrics", () => {
  it("increments from zero on first call", async () => {
    await addToMonthlyMetrics("t1", "202601", {
      pot_volume_lamports: "1000000000",
      ticket_count: 10,
      pool_count: 1,
      protocol_fees_lamports: "10000000",
    });
    const m = await getMonthlyMetrics("t1", "202601");
    expect(m.pot_volume_lamports).toBe("1000000000");
    expect(m.ticket_count).toBe(10);
    expect(m.pool_count).toBe(1);
    expect(m.protocol_fees_lamports).toBe("10000000");
  });

  it("accumulates correctly across multiple calls", async () => {
    await addToMonthlyMetrics("t2", "202601", {
      pot_volume_lamports: "2000000000",
      ticket_count: 20,
      pool_count: 2,
      protocol_fees_lamports: "20000000",
    });
    await addToMonthlyMetrics("t2", "202601", {
      pot_volume_lamports: "3000000000",
      ticket_count: 30,
      pool_count: 1,
      protocol_fees_lamports: "30000000",
    });
    const m = await getMonthlyMetrics("t2", "202601");
    expect(m.pot_volume_lamports).toBe("5000000000");
    expect(m.ticket_count).toBe(50);
    expect(m.pool_count).toBe(3);
    expect(m.protocol_fees_lamports).toBe("50000000");
  });

  it("handles large BigInt values without precision loss", async () => {
    // 999 SOL in lamports = 999_000_000_000 — exceeds safe JS integer range.
    const large = "999000000000000"; // 999_000 SOL
    await addToMonthlyMetrics("t3", "202601", {
      pot_volume_lamports: large,
    });
    await addToMonthlyMetrics("t3", "202601", {
      pot_volume_lamports: "1",
    });
    const m = await getMonthlyMetrics("t3", "202601");
    expect(m.pot_volume_lamports).toBe("999000000000001");
  });

  it("omitting optional delta fields leaves them zero", async () => {
    await addToMonthlyMetrics("t4", "202601", {
      ticket_count: 5,
    });
    const m = await getMonthlyMetrics("t4", "202601");
    expect(m.pot_volume_lamports).toBe("0");
    expect(m.ticket_count).toBe(5);
    expect(m.protocol_fees_lamports).toBe("0");
  });

  it("is keyed per tenant and per month independently", async () => {
    await addToMonthlyMetrics("ta", "202601", { pool_count: 1 });
    await addToMonthlyMetrics("tb", "202601", { pool_count: 2 });
    await addToMonthlyMetrics("ta", "202602", { pool_count: 3 });

    const ta01 = await getMonthlyMetrics("ta", "202601");
    const tb01 = await getMonthlyMetrics("tb", "202601");
    const ta02 = await getMonthlyMetrics("ta", "202602");

    expect(ta01.pool_count).toBe(1);
    expect(tb01.pool_count).toBe(2);
    expect(ta02.pool_count).toBe(3);
  });
});

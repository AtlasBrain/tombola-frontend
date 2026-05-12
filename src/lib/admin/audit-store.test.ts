import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "@/lib/__mocks__/fake-redis";

const fake = new FakeRedis();
vi.mock("@/lib/kv/redis", () => ({
  getRedis: () => fake,
}));

import {
  AUDIT_TTL_SEC,
  listAuditEvents,
  recordAuditEvent,
} from "./audit-store";

const A1 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const A2 = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.zsets.clear();
  fake.ttls.clear();
});

describe("recordAuditEvent", () => {
  it("writes to the correct day bucket and sets TTL", async () => {
    const event = await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/overview",
      status: 200,
    });
    expect(event).not.toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    const key = `audit:${today}`;
    expect(fake.zsets.get(key)?.size).toBe(1);
    expect(fake.ttls.get(key)).toBe(AUDIT_TTL_SEC);
  });

  it("attaches a random salt so duplicate events don't collide", async () => {
    const a = await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/overview",
      status: 200,
    });
    const b = await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/overview",
      status: 200,
    });
    expect(a?.salt).not.toBe(b?.salt);
    const today = new Date().toISOString().slice(0, 10);
    expect(fake.zsets.get(`audit:${today}`)?.size).toBe(2);
  });

  it("persists meta on maintenance events", async () => {
    const event = await recordAuditEvent({
      wallet: A1,
      method: "POST",
      path: "/api/admin/maintenance/backfill",
      status: 200,
      meta: { backfilled: 42, skipped: 0 },
    });
    expect(event?.meta?.backfilled).toBe(42);
  });

  it("swallows KV errors silently", async () => {
    // Replace getRedis to return null mid-call.
    const mod = await import("@/lib/kv/redis");
    const orig = mod.getRedis;
    const m = mod as unknown as { getRedis: () => unknown };
    m.getRedis = () => null;
    try {
      const ev = await recordAuditEvent({
        wallet: A1,
        method: "GET",
        path: "/api/admin/overview",
        status: 200,
      });
      expect(ev).toBeNull();
    } finally {
      m.getRedis = orig;
    }
  });
});

describe("listAuditEvents", () => {
  it("returns empty when nothing recorded", async () => {
    expect(await listAuditEvents()).toEqual([]);
  });

  it("returns events sorted chronologically", async () => {
    await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/overview",
      status: 200,
    });
    await new Promise((r) => setTimeout(r, 2));
    await recordAuditEvent({
      wallet: A2,
      method: "GET",
      path: "/api/admin/users",
      status: 200,
    });
    const events = await listAuditEvents();
    expect(events).toHaveLength(2);
    expect(events[0].wallet).toBe(A1);
    expect(events[1].wallet).toBe(A2);
    expect(events[0].ts).toBeLessThanOrEqual(events[1].ts);
  });

  it("filters by wallet", async () => {
    await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/users",
      status: 200,
    });
    await recordAuditEvent({
      wallet: A2,
      method: "GET",
      path: "/api/admin/users",
      status: 200,
    });
    const events = await listAuditEvents({ wallet: A2 });
    expect(events).toHaveLength(1);
    expect(events[0].wallet).toBe(A2);
  });

  it("filters by path substring", async () => {
    await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/users",
      status: 200,
    });
    await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/pools/abc",
      status: 200,
    });
    const events = await listAuditEvents({ pathContains: "/pools/" });
    expect(events).toHaveLength(1);
    expect(events[0].path).toBe("/api/admin/pools/abc");
  });

  it("filters by status (e.g. rejected calls)", async () => {
    await recordAuditEvent({
      wallet: A1,
      method: "GET",
      path: "/api/admin/users",
      status: 200,
    });
    await recordAuditEvent({
      wallet: A1,
      method: "POST",
      path: "/api/admin/maintenance/backfill",
      status: 403,
    });
    const events = await listAuditEvents({ status: 403 });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(403);
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAuditEvent({
        wallet: A1,
        method: "GET",
        path: "/api/admin/overview",
        status: 200,
      });
      await new Promise((r) => setTimeout(r, 1));
    }
    const events = await listAuditEvents({ limit: 3 });
    expect(events).toHaveLength(3);
  });

  it("returns empty when fromMs > toMs", async () => {
    const events = await listAuditEvents({
      fromMs: Date.now(),
      toMs: Date.now() - 1000,
    });
    expect(events).toEqual([]);
  });
});

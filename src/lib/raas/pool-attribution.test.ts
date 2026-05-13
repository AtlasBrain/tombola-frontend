// src/lib/raas/pool-attribution.test.ts
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
  attributePool,
  getPoolTenant,
  listTenantPools,
} from "./pool-attribution.js";

beforeEach(() => {
  _store.clear();
});

describe("attributePool", () => {
  it("writes pool→tenant mapping", async () => {
    await attributePool({
      pool_pubkey: "Pool1111111111111111111111111111111111111111",
      tenant_slug: "acme",
      created_via: "manual",
    });
    const result = await getPoolTenant(
      "Pool1111111111111111111111111111111111111111",
    );
    expect(result?.tenant_slug).toBe("acme");
  });

  it("appends to tenant's pool index", async () => {
    await attributePool({
      pool_pubkey: "Pool2222222222222222222222222222222222222222",
      tenant_slug: "acme2",
      created_via: "manual",
    });
    await attributePool({
      pool_pubkey: "Pool3333333333333333333333333333333333333333",
      tenant_slug: "acme2",
      created_via: "manual",
    });
    const pools = await listTenantPools("acme2");
    expect(pools).toContain("Pool2222222222222222222222222222222222222222");
    expect(pools).toContain("Pool3333333333333333333333333333333333333333");
  });

  it("does not duplicate pool in index on re-attribution", async () => {
    const pubkey = "Pool4444444444444444444444444444444444444444";
    await attributePool({ pool_pubkey: pubkey, tenant_slug: "acme3", created_via: "manual" });
    await attributePool({ pool_pubkey: pubkey, tenant_slug: "acme3", created_via: "manual" });
    const pools = await listTenantPools("acme3");
    expect(pools.filter((p) => p === pubkey).length).toBe(1);
  });
});

describe("getPoolTenant", () => {
  it("returns null for unknown pool", async () => {
    expect(
      await getPoolTenant("PoolNonExistent11111111111111111111111111111"),
    ).toBeNull();
  });
});

describe("listTenantPools", () => {
  it("returns empty array for tenant with no pools", async () => {
    expect(await listTenantPools("no-pools-tenant")).toEqual([]);
  });
});

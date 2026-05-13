// src/lib/raas/tenant.test.ts
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
  createTenant,
  getTenant,
  isSlugReserved,
  listOwnerSlugs,
} from "./tenant.js";

beforeEach(() => {
  _store.clear();
});

describe("createTenant", () => {
  it("creates a new tenant with status=active", async () => {
    const t = await createTenant({
      slug: "acme",
      display_name: "Acme Raffles",
      owner_wallet: "11111111111111111111111111111111",
      contact_email: "owner@acme.test",
      primary_color: "#88cfc4",
      accent_color: "#c9b5dc",
    });
    expect(t.status).toBe("active");
    expect(t.slug).toBe("acme");
  });

  it("rejects collision on existing slug", async () => {
    await createTenant({
      slug: "dup",
      display_name: "Dup",
      owner_wallet: "11111111111111111111111111111111",
      contact_email: "a@a.com",
      primary_color: "#000000",
      accent_color: "#ffffff",
    });
    await expect(
      createTenant({
        slug: "dup",
        display_name: "Dup2",
        owner_wallet: "22222222222222222222222222222222",
        contact_email: "b@b.com",
        primary_color: "#000000",
        accent_color: "#ffffff",
      }),
    ).rejects.toThrow(/already exists|slug.*taken/i);
  });

  it("rejects invalid slug", async () => {
    await expect(
      createTenant({
        slug: "Ad",
        display_name: "x",
        owner_wallet: "1",
        contact_email: "a@a.com",
        primary_color: "#000",
        accent_color: "#fff",
      }),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("rejects reserved slug", async () => {
    await expect(
      createTenant({
        slug: "admin",
        display_name: "x",
        owner_wallet: "1",
        contact_email: "a@a.com",
        primary_color: "#000",
        accent_color: "#fff",
      }),
    ).rejects.toThrow(/reserved|invalid/i);
  });

  it("populates owner index", async () => {
    const wallet = "33333333333333333333333333333333";
    await createTenant({
      slug: "foo",
      display_name: "Foo",
      owner_wallet: wallet,
      contact_email: "a@a.com",
      primary_color: "#000",
      accent_color: "#fff",
    });
    const slugs = await listOwnerSlugs(wallet);
    expect(slugs).toContain("foo");
  });
});

describe("getTenant", () => {
  it("returns null for nonexistent", async () => {
    expect(await getTenant("nope")).toBeNull();
  });

  it("returns tenant for existing slug", async () => {
    await createTenant({
      slug: "foo",
      display_name: "Foo",
      owner_wallet: "11111111111111111111111111111111",
      contact_email: "a@a.com",
      primary_color: "#000",
      accent_color: "#fff",
    });
    const t = await getTenant("foo");
    expect(t).not.toBeNull();
    expect(t?.display_name).toBe("Foo");
  });
});

describe("isSlugReserved", () => {
  it("returns false for never-created slug", async () => {
    expect(await isSlugReserved("fresh-slug")).toBe(false);
  });

  it("returns true after createTenant reserves the slug", async () => {
    await createTenant({
      slug: "moo",
      display_name: "Moo",
      owner_wallet: "11111111111111111111111111111111",
      contact_email: "x@x.com",
      primary_color: "#000",
      accent_color: "#fff",
    });
    expect(await isSlugReserved("moo")).toBe(true);
  });
});

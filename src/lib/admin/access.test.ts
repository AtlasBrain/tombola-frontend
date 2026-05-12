import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { adminConfigured, isAdminWallet } from "./access";

describe("isAdminWallet", () => {
  const original = process.env.ADMIN_WALLETS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_WALLETS;
    else process.env.ADMIN_WALLETS = original;
  });
  beforeEach(() => {
    delete process.env.ADMIN_WALLETS;
  });

  it("rejects when ADMIN_WALLETS is unset", () => {
    expect(isAdminWallet("A9XZ...CDWY")).toBe(false);
  });

  it("rejects empty / null / undefined wallets", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY";
    expect(isAdminWallet(null)).toBe(false);
    expect(isAdminWallet(undefined)).toBe(false);
    expect(isAdminWallet("")).toBe(false);
  });

  it("accepts a single configured wallet", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY";
    expect(isAdminWallet("A9XZ...CDWY")).toBe(true);
  });

  it("accepts a wallet inside a comma-separated list", () => {
    process.env.ADMIN_WALLETS = "AAAA...1111,A9XZ...CDWY,BBBB...2222";
    expect(isAdminWallet("A9XZ...CDWY")).toBe(true);
    expect(isAdminWallet("AAAA...1111")).toBe(true);
    expect(isAdminWallet("BBBB...2222")).toBe(true);
  });

  it("is whitespace-tolerant around list entries", () => {
    process.env.ADMIN_WALLETS = "  A9XZ...CDWY  ,  BBBB...2222 ";
    expect(isAdminWallet("A9XZ...CDWY")).toBe(true);
    expect(isAdminWallet("BBBB...2222")).toBe(true);
  });

  it("is case-sensitive (base58 IS case-sensitive)", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY";
    expect(isAdminWallet("a9xz...cdwy")).toBe(false);
  });

  it("rejects a wallet not in the list", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY";
    expect(isAdminWallet("XXXX...9999")).toBe(false);
  });

  it("handles empty entries from trailing commas", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY,,";
    expect(isAdminWallet("A9XZ...CDWY")).toBe(true);
    expect(isAdminWallet("")).toBe(false);
  });
});

describe("adminConfigured", () => {
  const original = process.env.ADMIN_WALLETS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_WALLETS;
    else process.env.ADMIN_WALLETS = original;
  });
  beforeEach(() => {
    delete process.env.ADMIN_WALLETS;
  });

  it("is false when unset", () => {
    expect(adminConfigured()).toBe(false);
  });
  it("is false when empty string", () => {
    process.env.ADMIN_WALLETS = "";
    expect(adminConfigured()).toBe(false);
  });
  it("is false when only commas/whitespace", () => {
    process.env.ADMIN_WALLETS = " , , ";
    expect(adminConfigured()).toBe(false);
  });
  it("is true when at least one wallet present", () => {
    process.env.ADMIN_WALLETS = "A9XZ...CDWY";
    expect(adminConfigured()).toBe(true);
  });
});

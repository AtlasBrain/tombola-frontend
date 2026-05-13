import { describe, it, expect } from "vitest";
import { generateInviteCodes, computeRootFromCodes } from "./invite-codes.js";

describe("generateInviteCodes", () => {
  it("returns N unique codes of the configured length", () => {
    const codes = generateInviteCodes(50);
    expect(codes.length).toBe(50);
    expect(new Set(codes).size).toBe(50); // unique
    for (const c of codes) {
      expect(c.length).toBeGreaterThanOrEqual(12);
      expect(c).toMatch(/^[A-HJ-NP-Za-km-z2-9-]+$/); // base58-friendly, no easily confused chars
    }
  });

  it("rejects zero or negative count", () => {
    expect(() => generateInviteCodes(0)).toThrow(/at least 1/i);
    expect(() => generateInviteCodes(-5)).toThrow(/at least 1/i);
  });

  it("rejects more than 1000 codes per pool", () => {
    expect(() => generateInviteCodes(1001)).toThrow(/max 1000/i);
  });
});

describe("computeRootFromCodes", () => {
  it("returns a 32-byte Merkle root", async () => {
    const codes = ["alpha-secret-001", "beta-secret-002", "gamma-secret-003", "delta-secret-004"];
    const root = await computeRootFromCodes(codes);
    expect(root).toBeInstanceOf(Uint8Array);
    expect(root.length).toBe(32);
  });

  it("returns a non-zero root for non-empty codes", async () => {
    const codes = ["a", "b"];
    const root = await computeRootFromCodes(codes);
    expect(root.some((b) => b !== 0)).toBe(true);
  });

  it("returns the same root for the same code set (order-insensitive)", async () => {
    const codes1 = ["a", "b", "c", "d"];
    const codes2 = ["d", "c", "b", "a"];
    const r1 = await computeRootFromCodes(codes1);
    const r2 = await computeRootFromCodes(codes2);
    expect(r1).toEqual(r2);
  });
});

import { describe, it, expect } from "vitest";
import { classifyPool } from "../scan.js";

// PoolState discriminant values: 0=Open, 1=AwaitingVrf, 2=Resolved
describe("classifyPool", () => {
  const BASE = {
    totalTickets: 10n,
    closeTime: 1_000_000n,
    commitSlot: 0n,
  };
  const now = 2_000_000n; // well past close_time
  const STUCK_THRESHOLD = 3_600n;

  it("returns 'commit' for open pool past close_time with tickets", () => {
    expect(classifyPool({ ...BASE, state: 0 }, now, STUCK_THRESHOLD)).toBe("commit");
  });

  it("returns null for open pool past close_time with zero tickets", () => {
    expect(classifyPool({ ...BASE, state: 0, totalTickets: 0n }, now, STUCK_THRESHOLD)).toBeNull();
  });

  it("returns null for open pool not yet closed", () => {
    expect(classifyPool({ ...BASE, state: 0, closeTime: 9_999_999_999n }, now, STUCK_THRESHOLD)).toBeNull();
  });

  it("returns 'settle' for AwaitingVrf pool within stuck threshold", () => {
    // closeTime = now - 60s, not stuck yet (threshold = 3600s)
    const closeTime = now - 60n;
    expect(classifyPool({ ...BASE, state: 1, closeTime }, now, STUCK_THRESHOLD)).toBe("settle");
  });

  it("returns 'stuck' for AwaitingVrf pool past stuck threshold", () => {
    // closeTime = now - 3700s
    const closeTime = now - 4_000n;
    expect(classifyPool({ ...BASE, state: 1, closeTime }, now, STUCK_THRESHOLD)).toBe("stuck");
  });

  it("returns null for resolved pool", () => {
    expect(classifyPool({ ...BASE, state: 2 }, now, STUCK_THRESHOLD)).toBeNull();
  });

  it("returns 'commit' when closeTime equals now (exact boundary)", () => {
    expect(classifyPool({ ...BASE, state: 0, closeTime: now }, now, STUCK_THRESHOLD)).toBe("commit");
  });

  it("returns 'stuck' when nowSec equals exactly the stuck threshold (exact boundary)", () => {
    const closeTime = now - STUCK_THRESHOLD;
    expect(classifyPool({ ...BASE, state: 1, closeTime }, now, STUCK_THRESHOLD)).toBe("stuck");
  });

  it("returns 'settle' for AwaitingVrf pool with zero tickets (settled anyway)", () => {
    const closeTime = now - 60n;
    expect(classifyPool({ ...BASE, state: 1, closeTime, totalTickets: 0n }, now, STUCK_THRESHOLD)).toBe("settle");
  });
});

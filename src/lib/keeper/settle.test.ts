import { describe, expect, it } from "vitest";
import { computeWinnerId, findWinningBatch } from "./settle";

describe("computeWinnerId", () => {
  it("maps the Switchboard revealed value to a ticket id in [0, total)", () => {
    expect(computeWinnerId(0n, 10n)).toBe(0n);
    expect(computeWinnerId(9n, 10n)).toBe(9n);
    expect(computeWinnerId(10n, 10n)).toBe(0n); // wraps
    expect(computeWinnerId(123_456n, 10n)).toBe(6n);
  });

  it("handles realistic full-range Switchboard u256-shaped values", () => {
    // 32-byte randomness => up to 2^256 - 1; bigint divides cleanly.
    const huge = (1n << 256n) - 1n;
    const winner = computeWinnerId(huge, 1_000n);
    expect(winner).toBeGreaterThanOrEqual(0n);
    expect(winner).toBeLessThan(1_000n);
  });

  it("returns 0 for total=1 (single-ticket round)", () => {
    expect(computeWinnerId(99_999n, 1n)).toBe(0n);
  });
});

describe("findWinningBatch", () => {
  // Mirrors the real shape: batches are sorted ASC by firstTicketId,
  // each owns a contiguous [first, last] range.
  const batches = [
    {
      batchAddress: "batch-A",
      owner: "Alice",
      firstTicketId: 0n,
      lastTicketId: 4n,
    },
    {
      batchAddress: "batch-B",
      owner: "Bob",
      firstTicketId: 5n,
      lastTicketId: 9n,
    },
    {
      batchAddress: "batch-C",
      owner: "Carol",
      firstTicketId: 10n,
      lastTicketId: 10n,
    },
  ];

  it("returns the batch whose range contains the winner id", () => {
    expect(findWinningBatch(batches, 0n)?.owner).toBe("Alice");
    expect(findWinningBatch(batches, 4n)?.owner).toBe("Alice");
    expect(findWinningBatch(batches, 5n)?.owner).toBe("Bob");
    expect(findWinningBatch(batches, 7n)?.owner).toBe("Bob");
    expect(findWinningBatch(batches, 10n)?.owner).toBe("Carol");
  });

  it("returns null when no batch contains the id (defensive — should never happen)", () => {
    expect(findWinningBatch(batches, 11n)).toBeNull();
    expect(findWinningBatch([], 0n)).toBeNull();
  });

  it("returns the matched batch (callers use only address+owner)", () => {
    const r = findWinningBatch(batches, 7n);
    expect(r?.batchAddress).toBe("batch-B");
    expect(r?.owner).toBe("Bob");
  });
});

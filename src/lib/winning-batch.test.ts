import { describe, it, expect } from "vitest";
import { findWinningBatch, type BatchRange } from "./winning-batch";

function range(
  first: bigint,
  last: bigint,
  owner = `o${first}`,
): BatchRange {
  return {
    batchAddress: `b${first}`,
    owner,
    firstTicketId: first,
    lastTicketId: last,
  };
}

describe("findWinningBatch", () => {
  it("returns the single batch in a 1-ticket pool", () => {
    const batches = [range(0n, 0n, "alice")];
    expect(findWinningBatch(batches, 0n)?.owner).toBe("alice");
  });

  it("matches winner inside an inclusive range [first..last]", () => {
    const batches = [
      range(0n, 4n, "alice"),
      range(5n, 9n, "bob"),
      range(10n, 14n, "carol"),
    ];
    expect(findWinningBatch(batches, 0n)?.owner).toBe("alice");
    expect(findWinningBatch(batches, 4n)?.owner).toBe("alice");
    expect(findWinningBatch(batches, 5n)?.owner).toBe("bob");
    expect(findWinningBatch(batches, 9n)?.owner).toBe("bob");
    expect(findWinningBatch(batches, 10n)?.owner).toBe("carol");
    expect(findWinningBatch(batches, 14n)?.owner).toBe("carol");
  });

  it("works regardless of input order", () => {
    const batches = [
      range(10n, 14n, "carol"),
      range(0n, 4n, "alice"),
      range(5n, 9n, "bob"),
    ];
    expect(findWinningBatch(batches, 7n)?.owner).toBe("bob");
  });

  it("returns null when no batch matches (defensive)", () => {
    const batches = [range(0n, 4n), range(10n, 14n)];
    expect(findWinningBatch(batches, 7n)).toBe(null);
    expect(findWinningBatch(batches, 99n)).toBe(null);
  });

  it("returns null on empty batch list", () => {
    expect(findWinningBatch([], 0n)).toBe(null);
  });
});

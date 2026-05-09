import { describe, it, expect } from "vitest";
import { __test } from "./RecentBuysTable";

const { sortByRecency } = __test;

function batch(firstTicketId: bigint, lastTicketId: bigint) {
  return {
    batchAddress: `b${firstTicketId}`,
    owner: `o${firstTicketId}`,
    firstTicketId,
    lastTicketId,
    quantity: lastTicketId - firstTicketId + 1n,
    spentLamports: 0n,
  };
}

describe("sortByRecency", () => {
  it("orders by firstTicketId DESC (most recent first)", () => {
    const out = sortByRecency([batch(0n, 4n), batch(20n, 24n), batch(5n, 9n)]);
    expect(out.map((b) => b.firstTicketId)).toEqual([20n, 5n, 0n]);
  });

  it("returns empty array for empty input", () => {
    expect(sortByRecency([])).toEqual([]);
  });

  it("does not mutate input", () => {
    const input = [batch(0n, 4n), batch(10n, 14n)];
    const before = input.map((b) => b.firstTicketId);
    sortByRecency(input);
    expect(input.map((b) => b.firstTicketId)).toEqual(before);
  });

  it("handles single batch", () => {
    const out = sortByRecency([batch(7n, 10n)]);
    expect(out).toHaveLength(1);
    expect(out[0].firstTicketId).toBe(7n);
  });
});

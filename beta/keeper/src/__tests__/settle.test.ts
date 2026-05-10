import { describe, it, expect } from "vitest";
import { computeWinnerId, findWinningBatch } from "../settle.js";

describe("computeWinnerId", () => {
  it("reduces revealed value modulo totalTickets", () => {
    expect(computeWinnerId(10n, 7n)).toBe(3n); // 10 % 7 = 3
    expect(computeWinnerId(0n, 100n)).toBe(0n);
    expect(computeWinnerId(99n, 100n)).toBe(99n);
    expect(computeWinnerId(100n, 100n)).toBe(0n);
  });
});

describe("findWinningBatch", () => {
  const batches = [
    { batchAddress: "A", owner: "walletA", firstTicketId: 0n, lastTicketId: 4n },
    { batchAddress: "B", owner: "walletB", firstTicketId: 5n, lastTicketId: 9n },
    { batchAddress: "C", owner: "walletC", firstTicketId: 10n, lastTicketId: 14n },
  ];

  it("finds the batch containing winnerId at first ticket", () => {
    expect(findWinningBatch(batches, 0n)?.batchAddress).toBe("A");
  });

  it("finds the batch containing winnerId at last ticket", () => {
    expect(findWinningBatch(batches, 14n)?.batchAddress).toBe("C");
  });

  it("finds the batch containing winnerId in the middle", () => {
    expect(findWinningBatch(batches, 7n)?.batchAddress).toBe("B");
  });

  it("returns null when no batch contains winnerId", () => {
    expect(findWinningBatch(batches, 99n)).toBeNull();
  });
});

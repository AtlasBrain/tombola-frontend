import { describe, it, expect } from "vitest";
import {
  computeLifetimeStats,
  filterPools,
  filterCounts,
  type PoolMembership,
} from "./buyer-pools";

function pool(over: Partial<PoolMembership>): PoolMembership {
  return {
    poolAddress: `pool${Math.random().toString().slice(2, 6)}`,
    kind: "public",
    state: "Open",
    closeTimeUnix: 1_700_000_000,
    ticketPriceLamports: 10_000_000n,
    totalTickets: 100n,
    totalPotLamports: 1_000_000_000n,
    winner: null,
    winningTicketId: null,
    participantsCount: null,
    myTickets: 5n,
    mySpentLamports: 50_000_000n,
    iWon: false,
    ...over,
  };
}

describe("computeLifetimeStats", () => {
  it("returns zeros for empty input", () => {
    expect(computeLifetimeStats([])).toEqual({
      poolsCount: 0,
      livePoolsCount: 0,
      resolvedCount: 0,
      wonCount: 0,
      totalTickets: 0n,
      totalSpentLamports: 0n,
      totalWonLamports: 0n,
      netPnLLamports: 0n,
    });
  });

  it("aggregates tickets + spent across all pools", () => {
    const stats = computeLifetimeStats([
      pool({ myTickets: 3n, mySpentLamports: 30_000_000n }),
      pool({ myTickets: 7n, mySpentLamports: 70_000_000n }),
    ]);
    expect(stats.totalTickets).toBe(10n);
    expect(stats.totalSpentLamports).toBe(100_000_000n);
    expect(stats.poolsCount).toBe(2);
    expect(stats.livePoolsCount).toBe(2);
  });

  it("counts wins + sums won pots only on resolved+iWon", () => {
    const stats = computeLifetimeStats([
      pool({
        state: "Resolved",
        iWon: true,
        totalPotLamports: 5_000_000_000n,
        myTickets: 1n,
        mySpentLamports: 10_000_000n,
      }),
      pool({
        state: "Resolved",
        iWon: false,
        totalPotLamports: 2_000_000_000n,
        myTickets: 2n,
        mySpentLamports: 20_000_000n,
      }),
      pool({
        state: "Open",
        iWon: false,
        myTickets: 3n,
        mySpentLamports: 30_000_000n,
      }),
    ]);
    expect(stats.resolvedCount).toBe(2);
    expect(stats.wonCount).toBe(1);
    expect(stats.totalWonLamports).toBe(5_000_000_000n);
    // P&L counts spent on resolved pools only: spent 10 + 20 = 30M; won 5B
    expect(stats.netPnLLamports).toBe(5_000_000_000n - 30_000_000n);
  });

  it("does not count spent on live pools toward P&L", () => {
    const stats = computeLifetimeStats([
      pool({ state: "Open", mySpentLamports: 100_000_000n }),
      pool({
        state: "Resolved",
        iWon: false,
        mySpentLamports: 10_000_000n,
      }),
    ]);
    // Only resolved spend (10M) counts toward P&L. Won = 0. Net = -10M.
    expect(stats.netPnLLamports).toBe(-10_000_000n);
  });

  it("treats AwaitingVrf as live (not resolved)", () => {
    const stats = computeLifetimeStats([
      pool({ state: "AwaitingVrf", mySpentLamports: 50_000_000n }),
    ]);
    expect(stats.livePoolsCount).toBe(1);
    expect(stats.resolvedCount).toBe(0);
    expect(stats.netPnLLamports).toBe(0n);
  });
});

describe("filterPools", () => {
  const pools = [
    pool({ poolAddress: "p-open", state: "Open", iWon: false }),
    pool({ poolAddress: "p-vrf", state: "AwaitingVrf", iWon: false }),
    pool({ poolAddress: "p-won", state: "Resolved", iWon: true }),
    pool({ poolAddress: "p-lost", state: "Resolved", iWon: false }),
  ];

  it('"all" returns everything', () => {
    expect(filterPools(pools, "all")).toHaveLength(4);
  });

  it('"live" returns Open + AwaitingVrf', () => {
    const out = filterPools(pools, "live");
    expect(out.map((p) => p.poolAddress)).toEqual(["p-open", "p-vrf"]);
  });

  it('"won" returns Resolved + iWon only', () => {
    const out = filterPools(pools, "won");
    expect(out.map((p) => p.poolAddress)).toEqual(["p-won"]);
  });

  it('"lost" returns Resolved + !iWon only', () => {
    const out = filterPools(pools, "lost");
    expect(out.map((p) => p.poolAddress)).toEqual(["p-lost"]);
  });
});

describe("filterCounts", () => {
  it("returns matching counts for all filters", () => {
    const pools = [
      pool({ state: "Open" }),
      pool({ state: "AwaitingVrf" }),
      pool({ state: "Resolved", iWon: true }),
      pool({ state: "Resolved", iWon: false }),
      pool({ state: "Resolved", iWon: false }),
    ];
    expect(filterCounts(pools)).toEqual({
      all: 5,
      live: 2,
      won: 1,
      lost: 2,
    });
  });
});

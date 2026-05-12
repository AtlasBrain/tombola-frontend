import { describe, expect, it } from "vitest";
import { classifyPool } from "./scan";

// classifyPool is the heart of the keeper's per-tick decision:
// "given this pool's current state + clock, what should the keeper do?"
// Wrong answer means the keeper either misses an actionable pool (users
// stuck on "Drawing…") or burns gas re-acting to a finished round.

const NOW = 1_000_000n; // arbitrary epoch, only relative comparison matters

describe("classifyPool — state 0 (Open)", () => {
  it("returns null when round is still open (closeTime in the future)", () => {
    expect(
      classifyPool(
        { state: 0, totalTickets: 5n, closeTime: NOW + 100n },
        NOW,
        3600n,
      ),
    ).toBeNull();
  });

  it("returns 'commit' once closeTime has elapsed AND there are tickets", () => {
    expect(
      classifyPool(
        { state: 0, totalTickets: 5n, closeTime: NOW - 1n },
        NOW,
        3600n,
      ),
    ).toBe("commit");
  });

  it("returns 'commit' exactly at closeTime (boundary is <=)", () => {
    expect(
      classifyPool(
        { state: 0, totalTickets: 1n, closeTime: NOW },
        NOW,
        3600n,
      ),
    ).toBe("commit");
  });

  it("returns null on a closed but ZERO-ticket round (voided)", () => {
    // Zero-ticket rounds can't have a winner; the on-chain settle path
    // treats them as voided. Keeper should skip them.
    expect(
      classifyPool(
        { state: 0, totalTickets: 0n, closeTime: NOW - 1n },
        NOW,
        3600n,
      ),
    ).toBeNull();
  });
});

describe("classifyPool — state 1 (AwaitingVrf)", () => {
  it("always returns 'settle' regardless of closeTime / tickets", () => {
    // Doc says: "Always attempt settle. waitForReveal / simulate in
    // settle.ts handles staleness; old close_time is not a valid
    // stuck-pool signal." This pins that behavior.
    expect(
      classifyPool(
        { state: 1, totalTickets: 1n, closeTime: NOW - 999_999n },
        NOW,
        3600n,
      ),
    ).toBe("settle");

    expect(
      classifyPool(
        { state: 1, totalTickets: 5n, closeTime: NOW + 100n },
        NOW,
        3600n,
      ),
    ).toBe("settle");

    // Even with zero tickets, state=1 means the on-chain side already
    // committed; settle path will surface the misconfiguration.
    expect(
      classifyPool(
        { state: 1, totalTickets: 0n, closeTime: NOW - 1n },
        NOW,
        3600n,
      ),
    ).toBe("settle");
  });
});

describe("classifyPool — state 2 (Resolved)", () => {
  it("returns null — keeper has nothing to do with finished rounds", () => {
    expect(
      classifyPool(
        { state: 2, totalTickets: 5n, closeTime: NOW - 1n },
        NOW,
        3600n,
      ),
    ).toBeNull();
  });
});

describe("classifyPool — unknown state", () => {
  it("returns null defensively (no action on garbage input)", () => {
    expect(
      classifyPool(
        { state: 99 as unknown as number, totalTickets: 1n, closeTime: NOW },
        NOW,
        3600n,
      ),
    ).toBeNull();
  });
});

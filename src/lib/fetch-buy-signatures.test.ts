import { describe, it, expect } from "vitest";
import { relativeTime } from "./fetch-buy-signatures";

describe("relativeTime", () => {
  const now = 1_700_000_000;

  it("returns em-dash for null blockTime", () => {
    expect(relativeTime(null, now)).toBe("—");
  });

  it("returns Ns for sub-minute deltas", () => {
    expect(relativeTime(now, now)).toBe("0s ago");
    expect(relativeTime(now - 5, now)).toBe("5s ago");
    expect(relativeTime(now - 59, now)).toBe("59s ago");
  });

  it("returns Nm for sub-hour deltas", () => {
    expect(relativeTime(now - 60, now)).toBe("1m ago");
    expect(relativeTime(now - 600, now)).toBe("10m ago");
    expect(relativeTime(now - 3_599, now)).toBe("59m ago");
  });

  it("returns Nh for sub-day deltas", () => {
    expect(relativeTime(now - 3_600, now)).toBe("1h ago");
    expect(relativeTime(now - 7_200, now)).toBe("2h ago");
    expect(relativeTime(now - 86_399, now)).toBe("23h ago");
  });

  it("returns Nd for day-plus deltas", () => {
    expect(relativeTime(now - 86_400, now)).toBe("1d ago");
    expect(relativeTime(now - 86_400 * 7, now)).toBe("7d ago");
  });

  it("clamps negative delta (clock skew) to 0s", () => {
    expect(relativeTime(now + 60, now)).toBe("0s ago");
  });
});

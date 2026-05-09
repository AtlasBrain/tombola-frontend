import { describe, it, expect, vi, beforeEach } from "vitest";
import { smoothScrollTo, easeInOutCubic } from "./smooth-scroll";

describe("easeInOutCubic", () => {
  it("returns 0 at t=0 and 1 at t=1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
  it("returns 0.5 at t=0.5 (symmetric)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("smoothScrollTo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true });
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn((opts: { top: number }) => {
        (window as unknown as { scrollY: number }).scrollY = opts.top;
      }),
      writable: true,
    });
  });

  it("calls scrollTo at least once and ends at the target", () => {
    smoothScrollTo(500, 100);
    vi.advanceTimersByTime(150);
    const calls = (window.scrollTo as unknown as { mock: { calls: { 0: { top: number } }[] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0].top).toBeCloseTo(500, 0);
  });
});

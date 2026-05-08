import { describe, it, expect } from "vitest";
import {
  formatSol,
  formatCountdown,
  formatTickets,
  formatSolCompact,
} from "./format";

describe("formatSol", () => {
  it("renders whole-SOL amounts without a decimal", () => {
    expect(formatSol(0n)).toBe("0 SOL");
    expect(formatSol(1_000_000_000n)).toBe("1 SOL");
    expect(formatSol(42_000_000_000n)).toBe("42 SOL");
  });

  it("renders fractional amounts up to 4 decimals, trimming trailing zeros", () => {
    expect(formatSol(1_500_000_000n)).toBe("1.5 SOL");
    expect(formatSol(10_000_000n)).toBe("0.01 SOL");
    expect(formatSol(123_400_000n)).toBe("0.1234 SOL");
  });

  it("rounds away precision below the 4-decimal cutoff", () => {
    // 1 lamport = 1e-9 SOL; we only show 4 decimals
    expect(formatSol(1n)).toBe("0.0 SOL");
    // 99_999 lamports = 0.000099999 SOL → trimmed to 4 dp = "0000" → 0
    expect(formatSol(99_999n)).toBe("0.0 SOL");
  });

  it("handles BigInt values larger than Number.MAX_SAFE_INTEGER without overflow", () => {
    // 2^60 lamports — would overflow if we converted to Number first.
    // Whole part 1_152_921_504 SOL, remainder 606_846_976 lamports → 0.6068.
    expect(formatSol(1_152_921_504_606_846_976n)).toBe(
      "1152921504.6068 SOL",
    );
  });
});

describe("formatCountdown", () => {
  // Stable reference instant for all tests
  const NOW = 1_778_544_000;

  it("formats future durations under a minute as seconds", () => {
    expect(formatCountdown(NOW + 30, NOW)).toBe("30s");
    expect(formatCountdown(NOW + 1, NOW)).toBe("1s");
  });

  it("formats future durations as Mm Ss / Hh Mm / Dd Hh", () => {
    expect(formatCountdown(NOW + 90, NOW)).toBe("1m 30s");
    expect(formatCountdown(NOW + 3661, NOW)).toBe("1h 1m");
    expect(formatCountdown(NOW + 86_400, NOW)).toBe("1d 0h");
    expect(formatCountdown(NOW + 90_000, NOW)).toBe("1d 1h");
  });

  it("formats past durations with `closed ... ago`", () => {
    expect(formatCountdown(NOW - 60, NOW)).toBe("closed 1m ago");
    expect(formatCountdown(NOW - 1_800, NOW)).toBe("closed 30m ago");
    expect(formatCountdown(NOW - 7_200, NOW)).toBe("closed 2h ago");
  });

  it("uses `yesterday` for past 24-48h, then dN ago", () => {
    expect(formatCountdown(NOW - 86_400, NOW)).toBe("closed yesterday");
    expect(formatCountdown(NOW - 90_000, NOW)).toBe("closed yesterday");
    expect(formatCountdown(NOW - 86_400 * 3, NOW)).toBe("closed 3d ago");
  });

  it("treats targetUnix === nowUnix as past (closed 0m ago)", () => {
    expect(formatCountdown(NOW, NOW)).toBe("closed 0m ago");
  });
});

describe("formatTickets", () => {
  it("renders the BigInt as a plain integer string", () => {
    expect(formatTickets(0n)).toBe("0");
    expect(formatTickets(1n)).toBe("1");
    expect(formatTickets(10_000n)).toBe("10000");
  });
});

describe("formatSolCompact", () => {
  it("falls back to formatSol below 1k whole SOL", () => {
    expect(formatSolCompact(0n)).toBe("0 SOL");
    expect(formatSolCompact(1_000_000_000n)).toBe("1 SOL");
    expect(formatSolCompact(999_000_000_000n)).toBe("999 SOL");
  });

  it("uses K SOL for 1k–999k whole SOL", () => {
    expect(formatSolCompact(1_000_000_000_000n)).toBe("1.0 K SOL");
    expect(formatSolCompact(12_500_000_000_000n)).toBe("12.5 K SOL");
    expect(formatSolCompact(999_000_000_000_000n)).toBe("999.0 K SOL");
  });

  it("uses M SOL for 1M–999M whole SOL", () => {
    expect(formatSolCompact(1_000_000_000_000_000n)).toBe("1.0 M SOL");
    expect(formatSolCompact(1_500_000_000_000_000n)).toBe("1.5 M SOL");
  });

  it("uses B SOL for >= 1B whole SOL", () => {
    expect(formatSolCompact(1_000_000_000_000_000_000n)).toBe("1.0 B SOL");
  });
});

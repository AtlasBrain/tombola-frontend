// Display formatters. Pure functions, no React imports — safe in any context.

const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * Format lamports as `X.XXX SOL`. Uses 4 decimals max; trims trailing zeros
 * so 1_000_000_000 → "1 SOL", 1_500_000_000 → "1.5 SOL", 10_000_000 → "0.01 SOL".
 */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;
  if (frac === 0n) return `${whole} SOL`;
  // 9 decimal places, trimmed.
  const fracStr = frac.toString().padStart(9, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}.${fracStr || "0"} SOL`;
}

/**
 * Format a unix-seconds timestamp as a human countdown to/from now:
 * `3d 14h`, `2h 5m`, `42s`, `closed 2h ago`, `closed yesterday`.
 */
export function formatCountdown(targetUnix: number, nowUnix: number): string {
  const diff = targetUnix - nowUnix;
  if (diff <= 0) {
    const past = -diff;
    if (past < 3600) return `closed ${Math.floor(past / 60)}m ago`;
    if (past < 86400) return `closed ${Math.floor(past / 3600)}h ago`;
    if (past < 86400 * 2) return `closed yesterday`;
    return `closed ${Math.floor(past / 86400)}d ago`;
  }
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}m ${s}s`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  return `${d}d ${h}h`;
}

/** Compact integer formatter (no commas). For 4-digit-ish ticket counts. */
export function formatTickets(n: bigint): string {
  return n.toString();
}

// Risk-flag thresholds.
//
// Defaults are reasonable for a fresh devnet deploy. Operators can
// tune via env vars at runtime — read on every call so a Vercel env
// edit takes effect on the next request, no redeploy of the metric
// modules needed.

const SECOND = 1;
const MINUTE = 60;
const LAMPORTS_PER_SOL = 1_000_000_000n;

export interface RiskThresholds {
  /** Pool flagged STUCK when AwaitingVrf longer than this. */
  stuckThresholdSec: number;
  /** Concentrated stake: any one wallet owns ≥ this share of tickets in a pool. */
  concentratedStakePct: number;
  /** Self-deal: creator owns ≥ this share AND won. */
  selfDealOwnerPct: number;
  /** User flagged BIG_SPENDER when lifetime spend ≥ this in lamports. */
  bigSpenderLamports: bigint;
  /** User flagged HIGH_ACTIVITY when distinct pools touched > this. */
  highActivityPoolCount: number;
  /** User flagged UNCLAIMED_HIGH_SPEND when no profile + spend ≥ this. */
  unclaimedHighSpendLamports: bigint;
}

export function loadRiskThresholds(): RiskThresholds {
  return {
    stuckThresholdSec: numEnv("RISK_STUCK_THRESHOLD_SEC", 60 * MINUTE * SECOND),
    concentratedStakePct: numEnv("RISK_CONCENTRATED_STAKE_PCT", 80),
    selfDealOwnerPct: numEnv("RISK_SELF_DEAL_OWNER_PCT", 50),
    bigSpenderLamports: bigEnv(
      "RISK_BIG_SPENDER_LAMPORTS",
      50n * LAMPORTS_PER_SOL,
    ),
    highActivityPoolCount: numEnv("RISK_HIGH_ACTIVITY_POOL_COUNT", 25),
    unclaimedHighSpendLamports: bigEnv(
      "RISK_UNCLAIMED_HIGH_SPEND_LAMPORTS",
      10n * LAMPORTS_PER_SOL,
    ),
  };
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bigEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : fallback;
  } catch {
    return fallback;
  }
}

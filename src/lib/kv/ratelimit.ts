// Centralized rate-limit factories backed by Upstash.
//
// Each call site picks a *named* limiter via `getLimiter(name)` so the
// prefixes stay stable across deploys (Upstash stores counters keyed by
// the prefix string). Sliding-window algorithm: smoother than fixed-window
// at bucket boundaries, simpler than token-bucket.
//
// When Upstash isn't configured (local dev without env), `getLimiter`
// returns null — call sites must treat null as "no rate limiting" and
// continue. We surface that as an explicit branch so it's obvious in code
// review which routes are unprotected in dev.

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";

export type LimiterName =
  | "profile-nonce"
  | "profile-write"
  | "friend-write"
  | "faucet";

/** Per-route limits. Pick conservative numbers — a real user clicks a
 *  button maybe once per second; bots farm. */
const RULES: Record<LimiterName, { limit: number; windowSec: number }> = {
  // Issuing a nonce is cheap but enables a write — cap at 30/min per wallet.
  "profile-nonce": { limit: 30, windowSec: 60 },
  // Profile saves: 10/min per wallet (UI debounces; users don't save 10x/min).
  "profile-write": { limit: 10, windowSec: 60 },
  // Friend mutations: 30/min per wallet covers bulk-add UX, blocks scripts.
  "friend-write": { limit: 30, windowSec: 60 },
  // Faucet: 5/min per IP — separate from per-code uniqueness which is permanent.
  faucet: { limit: 5, windowSec: 60 },
};

const cache = new Map<LimiterName, Ratelimit>();

export function getLimiter(name: LimiterName): Ratelimit | null {
  const cached = cache.get(name);
  if (cached) return cached;
  const redis = getRedis();
  if (!redis) return null;
  const { limit, windowSec } = RULES[name];
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: false,
    prefix: `rl:${name}`,
  });
  cache.set(name, rl);
  return rl;
}

/** Convenience: returns true when the identifier is over its budget.
 *  Treats "no Upstash" as "always allow" so local dev keeps working. */
export async function isRateLimited(
  name: LimiterName,
  identifier: string,
): Promise<boolean> {
  const rl = getLimiter(name);
  if (!rl) return false;
  const { success } = await rl.limit(identifier);
  return !success;
}

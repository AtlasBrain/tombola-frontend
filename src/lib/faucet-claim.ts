// Two-stage claim for one-shot invite codes consumed by /api/faucet.
//
//   1. `reserveCode` — atomic `SET NX EX 60` with a "pending:" marker.
//      Returns false if another request already holds the code OR the
//      code was permanently claimed. Crash between this and finalize
//      lets the TTL expire after 60s so the code becomes claimable
//      again.
//
//   2. `finalizeUsed` — long-TTL overwrite once the SOL transfer
//      confirmed. Promotes the reservation into a permanent claim.
//
//   3. `releaseReservation` — undo a still-pending reservation when
//      the transfer fails BEFORE confirmation. Safe: we only delete
//      keys whose value matches our own pending marker, so a
//      concurrent finalize that already ran (or another wallet's
//      reservation that beat ours) is never wiped.
//
// Extracted from the route handler so the logic is testable in
// isolation (route files have export-shape constraints under Next.js).

import { getRedis } from "./kv/redis";

const KEY_PREFIX = "tombola:faucet:used:";
export const PENDING_PREFIX = "pending:";
export const RESERVATION_TTL_SEC = 60;
export const CLAIM_TTL_SEC = 365 * 24 * 3600;

function key(code: string): string {
  return `${KEY_PREFIX}${code}`;
}

/** Local-dev fallback used when Upstash isn't configured. Per-lambda only,
 *  useless under multi-region — fine for `next dev`, never for prod. */
const memUsed = new Set<string>();

export async function reserveCode(
  code: string,
  wallet: string,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (memUsed.has(code)) return false;
    memUsed.add(code);
    return true;
  }
  const res = await redis.set(key(code), `${PENDING_PREFIX}${wallet}`, {
    nx: true,
    ex: RESERVATION_TTL_SEC,
  });
  return res !== null;
}

export async function finalizeUsed(
  code: string,
  wallet: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // memUsed already has the code from reserveCode
  await redis.set(key(code), wallet, { ex: CLAIM_TTL_SEC });
}

export async function releaseReservation(
  code: string,
  wallet: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memUsed.delete(code);
    return;
  }
  // Only delete if the value is still our pending marker; a concurrent
  // finalize that raced with this rollback must NOT be wiped.
  const cur = await redis.get<string>(key(code));
  if (cur === `${PENDING_PREFIX}${wallet}`) {
    await redis.del(key(code));
  }
}

/** Test-only — reset the in-memory fallback set. Exported because the
 *  fallback is module-state and otherwise leaks between tests. */
export function _resetMemUsedForTests(): void {
  memUsed.clear();
}

// Bulk friend-count loader for the admin user table.
//
// The user-facing app fetches per-wallet `SCARD friend-accepted:<w>`
// one at a time. For the admin table we'd otherwise issue N round
// trips for N users — pipelining all of them in one MULTI cuts the
// admin route's Redis time from O(N) RTT to O(1) RTT.
//
// Returns a Map<wallet, count>. Missing wallets default to 0 (no
// friend-accepted set ⇒ scard returns 0 anyway, but the explicit
// fallback removes a key-existence check on read).

import "server-only";
import { getRedis } from "@/lib/kv/redis";

const ACCEPTED_PREFIX = "friend-accepted:";

export async function friendCountsByWallet(
  wallets: Iterable<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const list = [...wallets];
  if (list.length === 0) return out;
  const r = getRedis();
  if (!r) return out;
  // Upstash pipeline. Each command returns its own slot in the result
  // array — we just walk both arrays in parallel.
  const pipe = r.pipeline();
  for (const w of list) pipe.scard(`${ACCEPTED_PREFIX}${w}`);
  const results = (await pipe.exec()) as Array<number | null | undefined>;
  for (let i = 0; i < list.length; i++) {
    const v = results[i];
    out.set(list[i], typeof v === "number" ? v : 0);
  }
  return out;
}

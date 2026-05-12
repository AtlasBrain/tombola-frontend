// Pseudo prefix-search index — a Redis sorted set keyed by lex order so the
// search palette can find users by typing the first few characters of their
// pseudo without scanning every `pseudo:*` key.
//
// Schema:
//   ZSET pseudo-index → members of the form `<lowercase-pseudo>::<wallet>`
//   all scores are 0 (lex-only ranking).
//
// Lookup:
//   ZRANGEBYLEX pseudo-index [<prefix> [<prefix>\xff
//   → returns every member whose pseudo starts with <prefix>, sorted lex.
//
// The double-colon separator + wallet suffix lets us recover the wallet
// from each match without a second round-trip. Two wallets can never claim
// the same pseudo (uniqueness is enforced by isPseudoAvailable), so
// `<pseudo>::<wallet>` is unique.

import { getRedis } from "./kv/redis";

const KEY = "pseudo-index";
const SEP = "::";

/** Build the sorted-set member string for `(pseudo, wallet)`. Pseudo is
 *  lowercased so the index lex order matches what the search input passes
 *  through (which is also lowercased before lookup). */
export function pseudoIndexMember(pseudo: string, wallet: string): string {
  return `${pseudo.toLowerCase()}${SEP}${wallet}`;
}

/** Parse a member back into its (pseudo, wallet) parts. Returns null on any
 *  malformed payload — defensive in case a future migration changes the
 *  separator. */
export function parsePseudoIndexMember(
  member: string,
): { pseudo: string; wallet: string } | null {
  const idx = member.indexOf(SEP);
  if (idx < 0) return null;
  return {
    pseudo: member.slice(0, idx),
    wallet: member.slice(idx + SEP.length),
  };
}

/** Add (pseudo, wallet) to the lex index. Idempotent — `zadd` returns 0
 *  when the member already exists. */
export async function addPseudoToIndex(
  pseudo: string,
  wallet: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.zadd(KEY, { score: 0, member: pseudoIndexMember(pseudo, wallet) });
}

/** Remove (pseudo, wallet) from the lex index. */
export async function removePseudoFromIndex(
  pseudo: string,
  wallet: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.zrem(KEY, pseudoIndexMember(pseudo, wallet));
}

/** Prefix-scan the index. Returns up to `limit` `(pseudo, wallet)` pairs
 *  whose pseudo starts with `prefix` (case-insensitive). Empty prefix
 *  returns nothing (we don't want a "list everyone" pathway). */
export async function searchPseudoPrefix(
  prefix: string,
  limit = 8,
): Promise<Array<{ pseudo: string; wallet: string }>> {
  const r = getRedis();
  if (!r) return [];
  const p = prefix.toLowerCase().trim();
  if (!p) return [];
  // Upstash `zrange` with `by: "lex"` accepts `[<value>` inclusive bounds.
  // The high bound `\xff` is past every valid pseudo character so the range
  // covers all members starting with `<p>`. The cast satisfies Upstash's
  // template-literal bound types without forcing the caller to spell out
  // the literal form.
  const min = `[${p}` as `[${string}`;
  const max = `[${p}\xff` as `[${string}`;
  const raw = await r.zrange(KEY, min, max, {
    byLex: true,
    offset: 0,
    count: limit,
  });
  if (!Array.isArray(raw)) return [];
  const out: Array<{ pseudo: string; wallet: string }> = [];
  for (const member of raw as string[]) {
    const parsed = parsePseudoIndexMember(member);
    if (parsed) out.push(parsed);
  }
  return out;
}

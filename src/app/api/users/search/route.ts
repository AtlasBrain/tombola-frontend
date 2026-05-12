// GET /api/users/search?q=<query>
//
// Two query shapes, picked by the same disambiguation rules as
// /api/profile/[handle]:
//
//   • 32–44 char base58 → wallet lookup. Returns at most one result.
//     The wallet doesn't have to have a stored profile — we return a
//     default-shape result so the palette can navigate to /u/<wallet>
//     either way.
//
//   • 1–24 chars matching [a-z0-9_]+ → pseudo PREFIX scan via the
//     sorted-set lex index. Returns up to 8 matches, ranked lex.
//
// Everything else returns an empty results array (not a 4xx) so the
// palette can stay quiet while the user types junk.
//
// Privacy: each result includes `isPublic` so the palette can render a
// 🔒 hint on private profiles without exposing private fields.

import { NextResponse } from "next/server";
import {
  defaultProfile,
  getProfileByPseudo,
  getProfileByWallet,
  type ProfileRow,
} from "@/lib/profile-store";
import {
  addPseudoToIndex,
  searchPseudoPrefix,
} from "@/lib/pseudo-index";
import { isRateLimited } from "@/lib/kv/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const WALLET_SHAPE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PSEUDO_PARTIAL = /^[a-z0-9_]{1,24}$/i;
const MAX_RESULTS = 8;

export interface SearchResult {
  wallet: string;
  /** null when wallet has no claimed pseudo. */
  pseudo: string | null;
  isPublic: boolean;
}

function toResult(row: ProfileRow): SearchResult {
  return {
    wallet: row.wallet,
    pseudo: row.pseudo,
    isPublic: row.isPublic,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("q") ?? "").trim();
  if (!raw) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  // Soft IP-level rate limit — keystroke-driven search would otherwise let
  // a malicious tab flood the endpoint. The pseudo-nonce limiter is the
  // closest pre-existing bucket; 30/min/IP is fine for typed search.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (await isRateLimited("profile-nonce", `search:${ip}`)) {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  // Wallet lookup — disambiguates by length + casing. Pseudos can't be 32+
  // chars AND contain uppercase or non-base58 chars, so anything that
  // matches the wallet shape exactly is treated as a wallet.
  if (raw.length > 24 && WALLET_SHAPE.test(raw)) {
    const row = (await getProfileByWallet(raw)) ?? defaultProfile(raw);
    return NextResponse.json({
      results: [toResult(row)] satisfies SearchResult[],
    });
  }

  // Pseudo prefix lookup. Loaded profiles fill in the isPublic flag from
  // the stored row; an index hit guarantees a stored row exists.
  if (PSEUDO_PARTIAL.test(raw)) {
    const matches = await searchPseudoPrefix(raw, MAX_RESULTS);
    const rows = await Promise.all(
      matches.map((m) => getProfileByWallet(m.wallet)),
    );
    const results: SearchResult[] = [];
    for (let i = 0; i < matches.length; i++) {
      const row = rows[i];
      if (!row) continue; // index pointed at a wallet whose profile got
      // deleted — skip gracefully rather than 500.
      results.push(toResult(row));
    }

    // Fallback + self-heal: profiles saved BEFORE the pseudo lex index
    // landed (commit d2392fe) aren't in the sorted set, so prefix
    // matches miss them. If the query is a full valid pseudo, try the
    // legacy exact-match key (pseudo:<lowercase> → wallet). On hit,
    // back-fill the lex index so future prefix searches find it.
    if (results.length === 0) {
      const FULL_PSEUDO = /^[a-z0-9_]{3,24}$/i;
      if (FULL_PSEUDO.test(raw)) {
        const row = await getProfileByPseudo(raw);
        if (row && row.pseudo) {
          await addPseudoToIndex(row.pseudo, row.wallet);
          results.push(toResult(row));
        }
      }
    }
    return NextResponse.json({ results });
  }

  // Unknown shape — empty results (not an error).
  return NextResponse.json({ results: [] satisfies SearchResult[] });
}

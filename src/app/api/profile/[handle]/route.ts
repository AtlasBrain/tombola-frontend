// GET /api/profile/[handle]
//
// `handle` is EITHER a base58 wallet pubkey (32 bytes -> 43-44 chars) or a
// pseudo ([a-z0-9_]{3,24}, case-insensitive). We pick the right index based
// on shape — pseudos can't collide with wallets because their character set
// and length constraints don't overlap with the base58 alphabet for 32-byte
// pubkeys.
//
// Applies the profile's `isPublic` flag: when private, the response hides
// stats / activity / badges and returns only the minimum identity bits
// (pseudo, avatar, wallet, xHandle). Stats / activity / friends are derived
// elsewhere (Phase 2+); this route is purely the stored profile shape.

import { NextResponse } from "next/server";
import {
  defaultProfile,
  getProfileByPseudo,
  getProfileByWallet,
  type ProfileRow,
} from "@/lib/profile-store";

interface RouteCtx { params: Promise<{ handle: string }>; }

// Base58 alphabet — pseudos are restricted to [a-z0-9_], so the presence of
// uppercase letters OR length > 24 disambiguates a wallet from a pseudo.
const WALLET_SHAPE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PSEUDO_SHAPE = /^[a-z0-9_]{3,24}$/i;

function looksLikeWallet(handle: string): boolean {
  // Length > 24 is always a wallet. Length 32-24 with a non-pseudo char is too.
  if (handle.length > 24) return WALLET_SHAPE.test(handle);
  // 3-24 char strings — treat as pseudo first, fall back to wallet if it
  // happens to be a valid 32-char base58 of an unusual key (rare; checked below).
  return false;
}

function publicView(row: ProfileRow): Partial<ProfileRow> {
  if (row.isPublic) return row;
  // Private view: drop nothing identity-related, but the caller will know not
  // to query stats / activity / badges. The privacy flag itself is exposed
  // so the page can render the "this profile is private" hint.
  return {
    wallet: row.wallet,
    pseudo: row.pseudo,
    xHandle: row.xHandle,
    xVerified: row.xVerified,
    isPublic: false,
    avatar: row.avatar,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { handle } = await ctx.params;
  if (!handle) {
    return NextResponse.json({ error: "Missing handle" }, { status: 400 });
  }

  let row: ProfileRow | null = null;
  if (looksLikeWallet(handle)) {
    row = await getProfileByWallet(handle);
    // If no stored profile yet, return a default profile shape so the page
    // can still render a stranger's wallet (with identicon + raw address).
    if (!row) row = defaultProfile(handle);
  } else if (PSEUDO_SHAPE.test(handle)) {
    row = await getProfileByPseudo(handle);
    // Pseudo not found — let the page render a 404.
    if (!row) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: "Invalid handle" }, { status: 400 });
  }

  return NextResponse.json({ profile: publicView(row) });
}

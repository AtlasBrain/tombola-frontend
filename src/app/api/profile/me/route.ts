// PUT /api/profile/me
//
// Update the caller's profile. The body carries the wallet pubkey, a nonce
// the server previously issued (see /api/profile/nonce/[wallet]), and a
// signature over `tombola:profile-edit:<nonce>` made with the wallet. The
// signature proves the request really comes from `wallet` — no JWT, no
// session, just on-the-wire crypto.

import { NextResponse } from "next/server";
import { verifySignedRequest } from "@/lib/profile-auth";
import { isRateLimited } from "@/lib/kv/ratelimit";
import {
  defaultProfile,
  getProfileByWallet,
  isPseudoAvailable,
  saveProfile,
  validatePseudo,
  type ProfileRow,
} from "@/lib/profile-store";

// Run on the Node runtime (not Edge) — Upstash & web3.js need Node APIs.
// Dynamic + short maxDuration: each request is fast and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

interface PutBody {
  wallet: string;
  nonce: string;
  signatureBase58: string;
  /** Fields the user wants to change. Omitted fields stay at their current value. */
  patch: Partial<
    Pick<ProfileRow, "pseudo" | "xHandle" | "isPublic" | "avatar">
  >;
}

export async function PUT(req: Request) {
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 1a. Rate-limit BEFORE consuming the nonce — otherwise a spammer could
  //     drain nonces without ever passing signature verification.
  if (
    typeof body.wallet === "string" &&
    (await isRateLimited("profile-write", body.wallet))
  ) {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  // 1b. Verify wallet signature over the nonce. On success the nonce is
  //     consumed; replays will fail at the next request.
  const authErr = await verifySignedRequest({
    wallet: body.wallet,
    nonce: body.nonce,
    signatureBase58: body.signatureBase58,
  });
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  // 2. Validate the patch field-by-field.
  const patch = body.patch ?? {};

  if (patch.pseudo !== undefined && patch.pseudo !== null) {
    const v = validatePseudo(patch.pseudo);
    if (v) return NextResponse.json({ error: v }, { status: 400 });
    const free = await isPseudoAvailable(patch.pseudo, body.wallet);
    if (!free) {
      return NextResponse.json(
        { error: "Pseudo already taken." },
        { status: 409 },
      );
    }
  }
  if (
    patch.xHandle !== undefined &&
    patch.xHandle !== null &&
    !X_HANDLE_RE.test(patch.xHandle)
  ) {
    return NextResponse.json(
      { error: "X handle must be 1–15 chars of letters/digits/underscore." },
      { status: 400 },
    );
  }
  if (
    patch.isPublic !== undefined &&
    typeof patch.isPublic !== "boolean"
  ) {
    return NextResponse.json(
      { error: "isPublic must be a boolean." },
      { status: 400 },
    );
  }

  // 3. Merge with existing (or default for first save) and persist.
  const prev = await getProfileByWallet(body.wallet);
  const base = prev ?? defaultProfile(body.wallet);
  const next: ProfileRow = {
    ...base,
    pseudo:
      patch.pseudo === undefined
        ? base.pseudo
        : patch.pseudo === null
          ? null
          : patch.pseudo.toLowerCase(),
    xHandle:
      patch.xHandle === undefined
        ? base.xHandle
        : patch.xHandle === null
          ? null
          : patch.xHandle,
    isPublic: patch.isPublic === undefined ? base.isPublic : patch.isPublic,
    avatar: patch.avatar === undefined ? base.avatar : patch.avatar,
    updatedAt: Date.now(),
  };

  try {
    await saveProfile(next, prev);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: next });
}

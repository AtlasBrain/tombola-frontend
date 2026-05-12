// POST   /api/admin/session   — exchange a signed nonce for a session cookie.
// DELETE /api/admin/session   — clear the session cookie.
//
// Login flow:
//   1. Browser GET /api/admin/nonce/<wallet> → { nonce }
//   2. Wallet signs `tombola:admin-session:<nonce>` (see adminLoginMessage)
//   3. Browser POST /api/admin/session { wallet, nonce, signatureBase58 }
//   4. Server: verify ed25519 → consume nonce → check allow-list → mint
//      signed cookie (HMAC-SHA256, 15-min TTL) → Set-Cookie httpOnly +
//      Secure + SameSite=Lax → 200.
//
// Even after a valid signature, allow-list rejection produces 403. We
// don't reveal allow-list membership earlier in the flow on purpose (see
// /api/admin/nonce comment).

import "server-only";
import nacl from "tweetnacl";
import { NextRequest, NextResponse } from "next/server";
import { decodeBase58 } from "@/lib/base58";
import { consumeNonce } from "@/lib/profile-store";
import { isAdminWallet } from "@/lib/admin/access";
import {
  ADMIN_SESSION_COOKIE,
  DEFAULT_TTL_SEC,
  adminLoginMessage,
  signSession,
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

interface LoginBody {
  wallet: string;
  nonce: string;
  signatureBase58: string;
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const { wallet, nonce, signatureBase58 } = body ?? {};

  if (
    typeof wallet !== "string" ||
    wallet.length < 32 ||
    wallet.length > 44 ||
    typeof nonce !== "string" ||
    nonce.length !== 64 ||
    typeof signatureBase58 !== "string"
  ) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Decode pubkey + signature.
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = decodeBase58(wallet);
    sigBytes = decodeBase58(signatureBase58);
  } catch {
    return NextResponse.json(
      { error: "Malformed wallet or signature." },
      { status: 400 },
    );
  }
  if (pubkeyBytes.length !== 32 || sigBytes.length !== 64) {
    return NextResponse.json(
      { error: "Malformed wallet or signature." },
      { status: 400 },
    );
  }

  // Verify signature against the canonical message.
  const messageBytes = new TextEncoder().encode(adminLoginMessage(nonce));
  const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!valid) {
    return NextResponse.json(
      { error: "Signature verification failed." },
      { status: 401 },
    );
  }

  // Consume nonce — one-shot, so replay is impossible. Must happen AFTER
  // sig verify so a bad sig doesn't burn an admin's nonce.
  const consumed = await consumeNonce(wallet, nonce);
  if (!consumed) {
    return NextResponse.json(
      { error: "Nonce expired or already used." },
      { status: 401 },
    );
  }

  // Now (and only now) enforce the allow-list. Don't 403 before this
  // point — see the /api/admin/nonce comment for the rationale.
  if (!isAdminWallet(wallet)) {
    return NextResponse.json(
      { error: "Forbidden — wallet not on admin allow-list." },
      { status: 403 },
    );
  }

  let token: string;
  try {
    token = signSession(wallet);
  } catch (e) {
    // ADMIN_SESSION_SECRET misconfigured. Surface 503 instead of 500 so
    // ops dashboards bucket it correctly.
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Admin session secret misconfigured.",
      },
      { status: 503 },
    );
  }

  const res = NextResponse.json({ ok: true, wallet });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEFAULT_TTL_SEC,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

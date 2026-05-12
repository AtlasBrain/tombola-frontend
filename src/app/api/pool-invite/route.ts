// POST /api/pool-invite     — create a pool invite (inviter-signed)
// DELETE /api/pool-invite   — revoke a pool invite (inviter-signed)
//
// Both verbs use the same {pool, friend, nonce, signatureBase58}
// envelope. Message shapes diverge so a CREATE signature can't be
// replayed as a REVOKE — see pool-invite-messages.ts.
//
// The CREATE handler accepts the redemption secret (code + base64
// merkle proof steps) from the inviter's local storage. The server
// stores it in KV gated behind a separate signed-claim endpoint.

import { NextResponse } from "next/server";
import {
  createInvite,
  revokeInvite,
  type InviteRow,
} from "@/lib/pool-invite-store";
import { verifySignedAction } from "@/lib/signed-action";
import {
  createInviteMessage,
  revokeInviteMessage,
} from "@/lib/pool-invite-messages";
import { isRateLimited } from "@/lib/kv/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface CreateBody {
  inviter: string;
  pool: string;
  friend: string;
  code: string;
  proofsBase64: string[];
  nonce: string;
  signatureBase58: string;
}

interface RevokeBody {
  inviter: string;
  pool: string;
  friend: string;
  nonce: string;
  signatureBase58: string;
}

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
}

function looksLikeWallet(w: unknown): w is string {
  return typeof w === "string" && w.length >= 32 && w.length <= 44;
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const { inviter, pool, friend, code, proofsBase64, nonce, signatureBase58 } =
    body;

  if (!looksLikeWallet(inviter) || !looksLikeWallet(friend) || !looksLikeWallet(pool)) {
    return jsonError("Invalid wallet, pool, or friend address", 400);
  }
  if (typeof code !== "string" || code.length === 0 || code.length > 128) {
    return jsonError("Invalid invite code payload", 400);
  }
  if (!Array.isArray(proofsBase64) || proofsBase64.some((p) => typeof p !== "string")) {
    return jsonError("Invalid merkle proof payload", 400);
  }

  // Rate-limit BEFORE consuming the nonce so spammers can't drain nonces.
  // Reuses the friend-write bucket since the invite UX is friend-graph
  // adjacent — same cadence (button click → toast).
  if (await isRateLimited("friend-write", inviter)) {
    return jsonError("Too many requests", 429, "rate_limited");
  }

  const messageBytes = new TextEncoder().encode(
    createInviteMessage(pool, friend, nonce),
  );
  const authErr = await verifySignedAction({
    wallet: inviter,
    messageBytes,
    signatureBase58,
    nonce,
  });
  if (authErr) return jsonError(authErr, 401);

  const row: InviteRow = {
    pool,
    friend,
    inviter,
    code,
    proofsBase64,
    createdAt: Date.now(),
    status: "sent",
  };
  const res = await createInvite(row);
  if (!res.ok) return jsonError(res.error ?? "Could not create invite", 409);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: RevokeBody;
  try {
    body = (await req.json()) as RevokeBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const { inviter, pool, friend, nonce, signatureBase58 } = body;

  if (!looksLikeWallet(inviter) || !looksLikeWallet(friend) || !looksLikeWallet(pool)) {
    return jsonError("Invalid wallet, pool, or friend address", 400);
  }
  if (await isRateLimited("friend-write", inviter)) {
    return jsonError("Too many requests", 429, "rate_limited");
  }

  const messageBytes = new TextEncoder().encode(
    revokeInviteMessage(pool, friend, nonce),
  );
  const authErr = await verifySignedAction({
    wallet: inviter,
    messageBytes,
    signatureBase58,
    nonce,
  });
  if (authErr) return jsonError(authErr, 401);

  const res = await revokeInvite(pool, friend, inviter);
  if (!res.ok) return jsonError(res.error ?? "Could not revoke", 409);
  // Echo the deleted row back so the client can refund the code to
  // localStorage (it was carved out of the inviter's pre-generated set
  // and is now safe to re-allocate to a different friend).
  return NextResponse.json({
    ok: true,
    code: res.row?.code,
    proofsBase64: res.row?.proofsBase64,
  });
}

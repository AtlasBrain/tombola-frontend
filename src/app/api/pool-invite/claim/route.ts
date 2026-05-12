// POST /api/pool-invite/claim
//
// Recipient signs a claim message; server returns the {code, proofsBase64}
// for that (pool, recipient) invite so the recipient can construct the
// on-chain `redeemInviteCodeWhitelist` instruction.
//
// The server marks the invite as `redeemed` BEFORE returning so a
// second concurrent claim doesn't re-issue the secret. If the on-chain
// redemption fails after this point the recipient must ask the inviter
// to revoke + re-create — same recovery model as today's manual code
// share.

import { NextResponse } from "next/server";
import {
  getInvite,
  markRedeemed,
} from "@/lib/pool-invite-store";
import { verifySignedAction } from "@/lib/signed-action";
import { claimInviteMessage } from "@/lib/pool-invite-messages";
import { isRateLimited } from "@/lib/kv/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface ClaimBody {
  wallet: string;
  pool: string;
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
  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const { wallet, pool, nonce, signatureBase58 } = body;

  if (!looksLikeWallet(wallet) || !looksLikeWallet(pool)) {
    return jsonError("Invalid wallet or pool address", 400);
  }
  if (await isRateLimited("friend-write", wallet)) {
    return jsonError("Too many requests", 429, "rate_limited");
  }

  const messageBytes = new TextEncoder().encode(claimInviteMessage(pool, nonce));
  const authErr = await verifySignedAction({
    wallet,
    messageBytes,
    signatureBase58,
    nonce,
  });
  if (authErr) return jsonError(authErr, 401);

  const row = await getInvite(pool, wallet);
  if (!row) return jsonError("No invite found for this wallet + pool.", 404);
  // Idempotent — a recipient who already redeemed and lost their tx can
  // re-claim to retrieve the code and re-broadcast.
  if (row.status !== "redeemed") await markRedeemed(pool, wallet);

  return NextResponse.json({
    code: row.code,
    proofsBase64: row.proofsBase64,
    inviter: row.inviter,
  });
}

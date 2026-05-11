// POST /api/friends
//
// Single mutation entrypoint for friend actions: request, accept, reject,
// unfriend. Body carries the caller's wallet, the target wallet, the
// action verb, a server-issued nonce, and a signature proving the caller
// owns the wallet.

import { NextResponse } from "next/server";
import {
  respondToFriendRequest,
  sendFriendRequest,
  unfriend,
  verifyFriendAction,
  type FriendAction,
} from "@/lib/friend-store";

// Run on the Node runtime (not Edge) — Upstash & web3.js need Node APIs.
// Dynamic + short maxDuration: each request is fast and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface PostBody {
  wallet: string;
  target: string;
  action: FriendAction;
  nonce: string;
  signatureBase58: string;
}

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { wallet, target, action } = body;
  if (!["request", "accept", "reject", "unfriend"].includes(action)) {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  }

  // Signature check + nonce consumption.
  const authErr = await verifyFriendAction({
    wallet,
    target,
    action,
    nonce: body.nonce,
    signatureBase58: body.signatureBase58,
  });
  if (authErr) return NextResponse.json({ error: authErr }, { status: 401 });

  let result: { ok: boolean; error?: string };
  switch (action) {
    case "request":
      result = await sendFriendRequest(wallet, target);
      break;
    case "accept":
      result = await respondToFriendRequest(wallet, target, true);
      break;
    case "reject":
      result = await respondToFriendRequest(wallet, target, false);
      break;
    case "unfriend":
      result = await unfriend(wallet, target);
      break;
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

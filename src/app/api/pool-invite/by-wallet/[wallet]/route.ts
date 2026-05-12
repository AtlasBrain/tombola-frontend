// GET /api/pool-invite/by-wallet/[wallet]
//
// Returns the metadata of every invite addressed to this wallet —
// pool address, inviter, status, createdAt. Deliberately NOT the
// `code` + `proofsBase64` — those are gated behind a separate signed
// claim endpoint so a passive observer (or an attacker who guesses the
// URL) can't read the redeemable payload.
//
// Drives the recipient's inbox view and the pool-page invite banner.

import { NextResponse } from "next/server";
import { getInvitesForWallet } from "@/lib/pool-invite-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RouteCtx {
  params: Promise<{ wallet: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { wallet } = await ctx.params;
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  const invites = await getInvitesForWallet(wallet);
  return NextResponse.json({ invites });
}

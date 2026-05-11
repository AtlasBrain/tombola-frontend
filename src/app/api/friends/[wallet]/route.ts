// GET /api/friends/[wallet]
//
// Returns the wallet's friend lists: accepted, pending-in, pending-out, and
// the accepted count. No auth — friendship is treated as public info (any
// wallet can be on someone's friend list and look it up). If you flip that
// to a private model later, restrict pending-in/out to the owner.

import { NextResponse } from "next/server";
import { getFriendCount, getFriendLists } from "@/lib/friend-store";

// Run on the Node runtime (not Edge) — Upstash & web3.js need Node APIs.
// Dynamic + short maxDuration: each request is fast and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RouteCtx { params: Promise<{ wallet: string }>; }

export async function GET(_req: Request, ctx: RouteCtx) {
  const { wallet } = await ctx.params;
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  const [lists, count] = await Promise.all([
    getFriendLists(wallet),
    getFriendCount(wallet),
  ]);
  return NextResponse.json({ ...lists, count });
}

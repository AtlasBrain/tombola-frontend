// GET /api/profile/nonce/[wallet]
//
// Returns a single-use nonce for the wallet to sign before mutating its
// profile. Stored in KV with a 5-minute TTL; consumed atomically by the
// PUT route on successful signature verification.

import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/profile-store";
import { isRateLimited } from "@/lib/kv/ratelimit";

// Run on the Node runtime (not Edge) — Upstash & web3.js need Node APIs.
// Dynamic + short maxDuration: each request is fast and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RouteCtx { params: Promise<{ wallet: string }>; }

export async function GET(_req: Request, ctx: RouteCtx) {
  const { wallet } = await ctx.params;
  // Cheap shape-only validation so we don't burn KV writes on garbage URLs.
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  if (await isRateLimited("profile-nonce", wallet)) {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }
  try {
    const nonce = await issueNonce(wallet);
    return NextResponse.json({ nonce });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

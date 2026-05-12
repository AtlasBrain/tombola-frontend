// GET /api/pool-invite/by-pool/[pool]
//
// Lists every invite issued for a private pool. Public metadata only —
// drives the creator's admin tab where they see which friends have
// been invited and whether each has redeemed. Status is updated client-
// side after the friend's on-chain redemption is confirmed, but the
// authoritative source remains the Whitelisted PDA — the UI may want to
// reconcile against that in the future.

import { NextResponse } from "next/server";
import { getInvitesForPool } from "@/lib/pool-invite-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RouteCtx {
  params: Promise<{ pool: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { pool } = await ctx.params;
  if (typeof pool !== "string" || pool.length < 32 || pool.length > 44) {
    return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
  }
  const invites = await getInvitesForPool(pool);
  return NextResponse.json({ invites });
}

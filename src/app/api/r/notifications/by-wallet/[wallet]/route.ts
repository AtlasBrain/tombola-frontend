// GET /api/r/notifications/by-wallet/[wallet]
//
// Returns pending RaaS notifications for a wallet and clears them (mark-read
// on consume pattern — mirrors how v1's pool-invite endpoint works).
//
// Source: Redis list at `raas:pending_invites:${wallet}` (lpush by
// assign-codes, raas_recurring_fired by cron/schedules).
//
// Returns: { notifications: PendingInvitePayload[] }
// On consume: lrange(0, 49) + delete key — single atomic set of ops.
//
// Capped at 50 entries per wallet (enforced by assign-codes ltrim).

import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const PENDING_INVITES_KEY = (wallet: string) =>
  `raas:pending_invites:${wallet}`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface RouteCtx {
  params: Promise<{ wallet: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { wallet } = await ctx.params;
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }

  const key = PENDING_INVITES_KEY(wallet);

  // Read the full list (up to 50 items).
  const raw = await redis.lrange<string>(key, 0, 49);
  if (!raw || raw.length === 0) {
    return NextResponse.json({ notifications: [] });
  }

  // Parse — each entry is JSON-stringified.
  const notifications = raw.map((item) => {
    if (typeof item === "string") {
      try {
        return JSON.parse(item) as unknown;
      } catch {
        return item;
      }
    }
    return item;
  });

  // Clear the list so notifications are delivered once (mark-read on consume).
  await redis.del(key);

  return NextResponse.json({ notifications });
}

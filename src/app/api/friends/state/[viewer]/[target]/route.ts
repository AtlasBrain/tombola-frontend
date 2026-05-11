// GET /api/friends/state/[viewer]/[target]
//
// Returns the relationship between two wallets from `viewer`'s perspective.
// No auth — this is read-only public data the ProfileCard uses to pick the
// right button (Add friend / Requested / Accept / Friends / Edit profile).

import { NextResponse } from "next/server";
import { getRelationship } from "@/lib/friend-store";

interface RouteCtx {
  params: Promise<{ viewer: string; target: string }>;
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const { viewer, target } = await ctx.params;
  // Cheap shape gate so we don't burn KV reads on garbage URLs.
  for (const v of [viewer, target]) {
    if (typeof v !== "string" || v.length < 32 || v.length > 44) {
      return NextResponse.json(
        { error: "Invalid wallet pubkey" },
        { status: 400 },
      );
    }
  }
  const relationship = await getRelationship(viewer, target);
  return NextResponse.json({ relationship });
}

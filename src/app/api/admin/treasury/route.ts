// GET /api/admin/treasury
//
// Read-only protocol-wallet snapshot — addresses, balances, rotation
// state, recent inflows. Never returns any signer-capable material;
// see architecture doc §5.8 for the design rationale.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getTreasury } from "@/lib/admin/metrics/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  try {
    const payload = await getTreasury();
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Treasury unavailable." },
      { status: 503 },
    );
  }
}

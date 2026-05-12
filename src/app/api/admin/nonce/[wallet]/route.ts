// GET /api/admin/nonce/:wallet
//
// Issues a fresh nonce that the admin wallet must sign to prove
// ownership of the private key. Mirrors /api/profile/nonce/[wallet] —
// same nonce store, different message prefix downstream so a profile-
// edit signature can't be replayed against the admin session.
//
// We don't reject pre-check on the allow-list — handing out a nonce is
// cheap and revealing "this wallet is not an admin" via 403 here would
// leak who the admins are. Always 200 + a nonce; the allow-list gate
// fires on the /api/admin/session POST.

import { NextRequest, NextResponse } from "next/server";
import { issueNonce } from "@/lib/profile-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ wallet: string }> },
) {
  const { wallet } = await ctx.params;
  if (
    typeof wallet !== "string" ||
    wallet.length < 32 ||
    wallet.length > 44
  ) {
    return NextResponse.json(
      { error: "Invalid wallet pubkey." },
      { status: 400 },
    );
  }
  let nonce: string;
  try {
    nonce = await issueNonce(wallet);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Nonce issuance failed." },
      { status: 503 },
    );
  }
  return NextResponse.json({ nonce });
}

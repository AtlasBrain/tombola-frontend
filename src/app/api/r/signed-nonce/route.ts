import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/raas/signed-action";

/**
 * GET /api/r/signed-nonce?context=<context>
 *
 * Issues a single-use nonce for the given context (e.g. `store_codes:<pool>`
 * or `read_codes:<pool>`). The nonce is stored in Redis with a 5-minute TTL.
 * The caller must sign `tombola:<context>:<nonce>` and include the signature
 * in the subsequent signed action request.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const context = url.searchParams.get("context");
  if (!context) {
    return NextResponse.json({ error: "missing_context" }, { status: 400 });
  }
  const nonce = await issueNonce(context);
  return NextResponse.json({ nonce });
}

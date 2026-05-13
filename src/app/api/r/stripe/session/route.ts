import { NextResponse } from "next/server";
import { createOnrampSession } from "@/lib/raas/stripe-onramp";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const walletAddress = body.walletAddress;
  const amountUsd = body.amountUsd;
  const cluster = body.cluster ?? "mainnet-beta";

  if (typeof walletAddress !== "string" || typeof amountUsd !== "number") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (cluster !== "mainnet-beta" && cluster !== "devnet") {
    return NextResponse.json({ error: "invalid_cluster" }, { status: 400 });
  }

  try {
    const session = await createOnrampSession({
      walletAddress,
      amountUsd,
      cluster,
    });
    return NextResponse.json({ session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "stripe_error", detail: msg }, { status: 500 });
  }
}

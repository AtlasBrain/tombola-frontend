import { NextResponse } from "next/server";
import { fetchPoolState } from "@/lib/raas/pool-fetch";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;
  const state = await fetchPoolState(pubkey);
  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(state);
}

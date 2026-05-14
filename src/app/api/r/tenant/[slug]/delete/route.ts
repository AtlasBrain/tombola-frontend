import { NextResponse } from "next/server";
import "server-only";
import { getTenant, softDeleteTenant } from "@/lib/raas/tenant";

// POST /api/r/tenant/[slug]/delete
// Body: { owner_wallet: string }
// Soft-deletes the tenant (sets status: "deleted").
// Caller must supply the owner wallet — server validates ownership.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const tenant = await getTenant(slug);
  if (!tenant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { owner_wallet } = body;
  if (typeof owner_wallet !== "string" || owner_wallet !== tenant.owner_wallet) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  await softDeleteTenant(slug);
  return NextResponse.json({ ok: true, status: "deleted" });
}

import { NextResponse } from "next/server";
import { attributePool } from "@/lib/raas/pool-attribution";
import { getTenant } from "@/lib/raas/tenant";
import { fetchPoolState } from "@/lib/raas/pool-fetch";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;

  let body: { tenant_slug?: string };
  try {
    body = (await request.json()) as { tenant_slug?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.tenant_slug) {
    return NextResponse.json({ error: "missing_tenant_slug" }, { status: 400 });
  }

  const tenant = await getTenant(body.tenant_slug);
  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  // Authorization: verify on-chain pool.creator matches tenant.owner_wallet.
  const poolState = await fetchPoolState(pubkey);
  if (!poolState) {
    return NextResponse.json({ error: "pool_not_found" }, { status: 404 });
  }
  if (poolState.creator !== tenant.owner_wallet) {
    return NextResponse.json(
      { error: "pool_creator_mismatch" },
      { status: 403 },
    );
  }

  await attributePool({
    pool_pubkey: pubkey,
    tenant_slug: body.tenant_slug,
    created_via: "manual",
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

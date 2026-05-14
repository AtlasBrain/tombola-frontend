import { NextResponse } from "next/server";
import "server-only";
import { createSchedule, listTenantSchedules } from "@/lib/raas/schedule";
import { getTenant } from "@/lib/raas/tenant";
import { verifySignedAction } from "@/lib/raas/signed-action";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    tenant_slug?: string;
    cadence?: string;
    day_of_week?: number | null;
    hour_utc?: number;
    template?: {
      name_template: string;
      ticket_price_lamports: number;
      duration_seconds: number;
      creator_fee_bps: number;
      gating_mode: "public" | "whitelisted";
      invite_count: number | null;
    };
    signed_proof?: { signature: string; nonce: string };
  } | null;

  if (!body?.tenant_slug || !body.signed_proof) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tenant = await getTenant(body.tenant_slug);
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce: body.signed_proof.nonce,
    signature: body.signed_proof.signature,
    context: `create_schedule:${body.tenant_slug}`,
  });
  if (!verified) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  if (
    !body.cadence ||
    body.hour_utc == null ||
    !body.template
  ) {
    return NextResponse.json({ error: "missing_schedule_fields" }, { status: 400 });
  }

  const schedule = await createSchedule({
    tenant_slug: body.tenant_slug,
    cadence: body.cadence as "daily" | "weekly" | "biweekly" | "monthly",
    day_of_week: body.day_of_week ?? null,
    hour_utc: body.hour_utc,
    template: body.template,
  });
  return NextResponse.json({ schedule }, { status: 201 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  if (!tenantSlug) {
    return NextResponse.json({ error: "missing_tenant" }, { status: 400 });
  }
  const schedules = await listTenantSchedules(tenantSlug);
  return NextResponse.json({ schedules });
}

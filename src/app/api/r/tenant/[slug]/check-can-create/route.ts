// src/app/api/r/tenant/[slug]/check-can-create/route.ts
// Pre-create limit check — called by CreatePoolWizard before submitting on-chain.
// Returns { ok: true } if the tenant may create a new pool, or { ok: false, reason }
// to abort with a user-facing message.
import { NextResponse } from "next/server";
import "server-only";

import { getTenant } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { fetchPoolState } from "@/lib/raas/pool-fetch";
import { getMonthlyMetrics, currentYearMonth } from "@/lib/raas/monthly-metrics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const tenant = await getTenant(slug);
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  if (tenant.status !== "active") {
    return NextResponse.json({ ok: false, reason: "tenant_suspended" }, { status: 200 });
  }

  // Count on-chain active (Open) pools attributed to this tenant.
  const poolPubkeys = await listTenantPools(slug);
  let active = 0;
  for (const p of poolPubkeys) {
    const state = await fetchPoolState(p);
    if (state && state.state === "Open") active += 1;
  }
  if (active >= tenant.limits.max_active_pools) {
    return NextResponse.json({
      ok: false,
      reason: "max_active_pools_reached",
      limit: tenant.limits.max_active_pools,
      current: active,
    });
  }

  // Check current-month pot volume cap.
  const ym = currentYearMonth();
  const monthly = await getMonthlyMetrics(slug, ym);
  if (
    BigInt(monthly.pot_volume_lamports) >=
    BigInt(tenant.limits.max_monthly_pot_lamports)
  ) {
    return NextResponse.json({ ok: false, reason: "monthly_volume_cap_reached" });
  }

  return NextResponse.json({ ok: true });
}

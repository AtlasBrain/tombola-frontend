// src/app/api/r/_ops/revenue/route.ts — Per-tenant protocol-fee aggregation.
//
// Reads from raas:tenant:${slug}:metrics:${YYYYMM} rollup keys (set by the
// settle-event scan job in Phase F). Falls back to 0 if no rollup data exists yet.
//
// Response:
//   { tenants: Array<{ slug, display_name, lifetime_protocol_fees_lamports }>,
//     total_protocol_fees_lamports: number }
import "server-only";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { Tenant } from "@/types/raas";
import { isOperator } from "@/lib/raas/operator-auth";

const redis = Redis.fromEnv();

export interface TenantRevenueSummary {
  slug: string;
  display_name: string;
  lifetime_protocol_fees_lamports: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("operator_wallet");
  if (!wallet || !isOperator(wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const slugs = (await redis.get<string[]>("raas:tenants:index")) ?? [];
  const summaries: TenantRevenueSummary[] = [];
  let grandTotal = 0;

  for (const slug of slugs) {
    const tenant = await redis.get<Tenant>(`raas:tenant:${slug}`);
    if (!tenant) continue;

    // Scan all available monthly rollups for this tenant.
    // Key pattern: raas:tenant:${slug}:metrics:${YYYYMM}
    // We read up to 36 months back (3 years). No cursor-scan needed since we
    // know the key format — just iterate months.
    let lifetimeFees = 0;
    const now = new Date();
    for (let i = 0; i < 36; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      const metrics = await redis.get<{ protocol_fees_lamports?: number }>(
        `raas:tenant:${slug}:metrics:${yyyymm}`,
      );
      if (metrics?.protocol_fees_lamports) {
        lifetimeFees += metrics.protocol_fees_lamports;
      }
    }

    summaries.push({
      slug,
      display_name: tenant.display_name,
      lifetime_protocol_fees_lamports: lifetimeFees,
    });
    grandTotal += lifetimeFees;
  }

  // Sort descending by fees
  summaries.sort(
    (a, b) => b.lifetime_protocol_fees_lamports - a.lifetime_protocol_fees_lamports,
  );

  return NextResponse.json({ tenants: summaries, total_protocol_fees_lamports: grandTotal });
}

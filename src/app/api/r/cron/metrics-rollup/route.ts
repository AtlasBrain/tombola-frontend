// src/app/api/r/cron/metrics-rollup/route.ts
// Hourly cron: scans all RaaS tenants, fetches their pools, and writes
// month-to-date rollup metrics to KV. Overwrites (not increments) the
// current-month entry on each run so it stays accurate after settlements.
//
// Auth: Bearer $CRON_SECRET header.
// Frequency: hourly (configured in vercel.json).
import { NextResponse } from "next/server";
import "server-only";

import { listAllTenantSlugs } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { fetchPoolState } from "@/lib/raas/pool-fetch";
import {
  currentYearMonth,
  type MonthlyMetrics,
} from "@/lib/raas/monthly-metrics";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// KV key — same formula as monthly-metrics.ts (duplicated to avoid importing
// the private constant; keeps the cron self-contained).
const METRICS_KEY = (slug: string, ym: string) =>
  `raas:tenant:${slug}:metrics:${ym}`;

// POST /api/r/cron/metrics-rollup
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ym = currentYearMonth();
  const slugs = await listAllTenantSlugs();

  const results: {
    slug: string;
    status: "ok" | "skipped" | "failed";
    pools?: number;
    reason?: string;
  }[] = [];

  for (const slug of slugs) {
    try {
      const poolPubkeys = await listTenantPools(slug);

      if (poolPubkeys.length === 0) {
        results.push({ slug, status: "skipped", pools: 0 });
        continue;
      }

      // Accumulate current-month totals by re-scanning settled pools.
      // We overwrite the KV entry to keep it accurate (idempotent rollup).
      let pot_volume_lamports = BigInt(0);
      let ticket_count = 0;
      let pool_count = 0;
      let protocol_fees_lamports = BigInt(0);

      // Protocol fee is 1% (100 bps) per pool.
      const PROTOCOL_FEE_BPS = 100n;

      for (const pubkey of poolPubkeys) {
        const state = await fetchPoolState(pubkey);
        if (!state) continue;

        // Only count pools that are settled (Resolved) or have tickets sold.
        // For MVP we sum all pools regardless of state to capture partial volume.
        const pot = BigInt(state.total_pot_lamports);
        const tickets = state.total_tickets;
        const protocolFee = (pot * PROTOCOL_FEE_BPS) / 10000n;

        pot_volume_lamports += pot;
        ticket_count += tickets;
        pool_count += 1;
        protocol_fees_lamports += protocolFee;
      }

      const metrics: MonthlyMetrics = {
        pot_volume_lamports: pot_volume_lamports.toString(),
        ticket_count,
        pool_count,
        protocol_fees_lamports: protocol_fees_lamports.toString(),
      };

      await redis.set(METRICS_KEY(slug, ym), metrics);

      results.push({ slug, status: "ok", pools: poolPubkeys.length });
    } catch (e) {
      results.push({
        slug,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ym,
    tenants: slugs.length,
    processed: results.length,
    results,
  });
}

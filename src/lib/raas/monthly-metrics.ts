// src/lib/raas/monthly-metrics.ts — Per-tenant monthly usage metrics helpers.
import "server-only";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const KEY = (slug: string, ym: string) => `raas:tenant:${slug}:metrics:${ym}`;

export interface MonthlyMetrics {
  pot_volume_lamports: string; // BigInt as string — total SOL wagered this month
  ticket_count: number;
  pool_count: number;
  protocol_fees_lamports: string; // BigInt as string
}

const ZERO_METRICS: MonthlyMetrics = {
  pot_volume_lamports: "0",
  ticket_count: 0,
  pool_count: 0,
  protocol_fees_lamports: "0",
};

export async function getMonthlyMetrics(
  slug: string,
  ym: string,
): Promise<MonthlyMetrics> {
  return (await redis.get<MonthlyMetrics>(KEY(slug, ym))) ?? { ...ZERO_METRICS };
}

export async function addToMonthlyMetrics(
  slug: string,
  ym: string,
  delta: Partial<MonthlyMetrics>,
): Promise<void> {
  const cur = await getMonthlyMetrics(slug, ym);
  const next: MonthlyMetrics = {
    pot_volume_lamports: (
      BigInt(cur.pot_volume_lamports) +
      BigInt(delta.pot_volume_lamports ?? "0")
    ).toString(),
    ticket_count: cur.ticket_count + (delta.ticket_count ?? 0),
    pool_count: cur.pool_count + (delta.pool_count ?? 0),
    protocol_fees_lamports: (
      BigInt(cur.protocol_fees_lamports) +
      BigInt(delta.protocol_fees_lamports ?? "0")
    ).toString(),
  };
  await redis.set(KEY(slug, ym), next);
}

/** Returns current UTC year+month as "YYYYMM", e.g. "202605". */
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

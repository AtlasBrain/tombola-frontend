// src/app/api/r/_ops/tenants/route.ts — GET list of all tenants with optional filter.
import "server-only";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { Tenant, TenantStatus } from "@/types/raas";
import { isOperator } from "@/lib/raas/operator-auth";

const redis = Redis.fromEnv();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("operator_wallet");
  if (!wallet || !isOperator(wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const filter = url.searchParams.get("status") as TenantStatus | null;

  const slugs = (await redis.get<string[]>("raas:tenants:index")) ?? [];
  const tenants: Tenant[] = [];
  for (const slug of slugs) {
    const t = await redis.get<Tenant>(`raas:tenant:${slug}`);
    if (!t) continue;
    if (filter && t.status !== filter) continue;
    tenants.push(t);
  }

  return NextResponse.json({ tenants });
}

// src/app/api/r/_ops/audit/route.ts — Paginated audit log list endpoint.
//
// GET /api/r/_ops/audit?operator_wallet=...&limit=100&offset=0&action=...&actor=...
import "server-only";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isOperator } from "@/lib/raas/operator-auth";
import type { AuditEntry } from "@/lib/raas/audit-log";

const redis = Redis.fromEnv();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("operator_wallet");
  if (!wallet || !isOperator(wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const actionFilter = url.searchParams.get("action");
  const actorFilter = url.searchParams.get("actor");

  // lrange is 0-indexed, inclusive on both ends
  const ids = await redis.lrange<string>(
    "raas:audit:index",
    offset,
    offset + limit - 1,
  );

  const entries: AuditEntry[] = [];
  for (const id of ids) {
    const entry = await redis.get<AuditEntry>(`raas:audit:${id}`);
    if (!entry) continue;
    if (actionFilter && entry.action !== actionFilter) continue;
    if (actorFilter && entry.actor_wallet !== actorFilter) continue;
    entries.push(entry);
  }

  return NextResponse.json({ entries, offset, limit });
}

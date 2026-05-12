// GET /api/admin/audit?from=ms&to=ms&wallet=&path=&status=&limit=
//
// Returns the recent admin-action audit feed with optional filters.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { listAuditEvents } from "@/lib/admin/audit-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const fromMs = parseMs(url.searchParams.get("from"));
  const toMs = parseMs(url.searchParams.get("to"));
  const wallet = url.searchParams.get("wallet") || undefined;
  const pathContains = url.searchParams.get("path") || undefined;
  const statusStr = url.searchParams.get("status");
  const status = statusStr ? Number(statusStr) || undefined : undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const events = await listAuditEvents({
      fromMs,
      toMs,
      wallet,
      pathContains,
      status,
      limit,
    });
    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Audit unavailable." },
      { status: 503 },
    );
  }
}

function parseMs(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseLimit(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(1000, Math.floor(n));
}

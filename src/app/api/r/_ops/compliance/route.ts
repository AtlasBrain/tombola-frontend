// src/app/api/r/_ops/compliance/route.ts — Manual compliance flags CRUD.
//
// KV key: raas:compliance:flags (JSON array of ComplianceFlag).
//
// GET  ?operator_wallet=...              → { flags }
// POST { operator_wallet, tenant_slug, reason }  → add flag → { flag }
// DELETE { operator_wallet, flag_id }    → dismiss flag → { ok }
import "server-only";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isOperator } from "@/lib/raas/operator-auth";

const redis = Redis.fromEnv();
const FLAGS_KEY = "raas:compliance:flags";

export interface ComplianceFlag {
  flag_id: string;
  tenant_slug: string;
  reason: string;
  flagged_by: string;
  flagged_at: string;
  dismissed_at: string | null;
}

async function readFlags(): Promise<ComplianceFlag[]> {
  return (await redis.get<ComplianceFlag[]>(FLAGS_KEY)) ?? [];
}

async function writeFlags(flags: ComplianceFlag[]): Promise<void> {
  await redis.set(FLAGS_KEY, flags);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("operator_wallet");
  if (!wallet || !isOperator(wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const showDismissed = url.searchParams.get("show_dismissed") === "1";
  const flags = await readFlags();
  const filtered = showDismissed ? flags : flags.filter((f) => f.dismissed_at === null);
  return NextResponse.json({ flags: filtered });
}

export async function POST(req: Request) {
  let body: {
    operator_wallet?: string;
    tenant_slug?: string;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { operator_wallet, tenant_slug, reason } = body;
  if (!operator_wallet || !isOperator(operator_wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  if (!tenant_slug || !reason) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const flag: ComplianceFlag = {
    flag_id: crypto.randomUUID(),
    tenant_slug,
    reason,
    flagged_by: operator_wallet,
    flagged_at: new Date().toISOString(),
    dismissed_at: null,
  };

  const flags = await readFlags();
  flags.push(flag);
  await writeFlags(flags);

  return NextResponse.json({ flag }, { status: 201 });
}

export async function DELETE(req: Request) {
  let body: { operator_wallet?: string; flag_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { operator_wallet, flag_id } = body;
  if (!operator_wallet || !isOperator(operator_wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  if (!flag_id) {
    return NextResponse.json({ error: "missing_flag_id" }, { status: 400 });
  }

  const flags = await readFlags();
  const idx = flags.findIndex((f) => f.flag_id === flag_id);
  if (idx === -1) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Soft-dismiss: set dismissed_at rather than deleting, so audit trail is intact.
  flags[idx] = { ...flags[idx], dismissed_at: new Date().toISOString() };
  await writeFlags(flags);

  return NextResponse.json({ ok: true });
}

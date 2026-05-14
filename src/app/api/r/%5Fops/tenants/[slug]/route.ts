// src/app/api/r/_ops/tenants/[slug]/route.ts — Operator tenant detail + PATCH actions.
//
// GET query params: wallet, nonce, signature
//   wallet must be an operator; nonce + signature verified against
//   context=read_tenant:{slug} (single-use, 5 min TTL).
//
// PATCH body: {
//   action: "suspend" | "reactivate" | "revoke_delegation" | "override_limits",
//   reason?: string,
//   limits?: Partial<TenantLimits>,          // only for override_limits
//   signed_proof: { signature: string; nonce: string },
//   operator_wallet: string,
// }
//
// Design: operator signs `tombola:ops_action:${nonce}` with their wallet.
// Nonce is issued via /api/r/signed-nonce?context=ops_action (single-use, 5 min TTL).
import "server-only";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { Tenant, TenantLimits } from "@/types/raas";
import { isOperator } from "@/lib/raas/operator-auth";
import { verifySignedAction } from "@/lib/raas/signed-action";
import { logAudit } from "@/lib/raas/audit-log";

const redis = Redis.fromEnv();

const TENANT_KEY = (slug: string) => `raas:tenant:${slug}`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");
  const nonce = url.searchParams.get("nonce");
  const signature = url.searchParams.get("signature");

  if (!wallet || !nonce || !signature) {
    return NextResponse.json({ error: "missing_auth_params" }, { status: 400 });
  }
  if (!isOperator(wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const verified = await verifySignedAction({
    wallet,
    nonce,
    signature,
    context: `read_tenant:${slug}`,
  });
  if (!verified) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const tenant = await redis.get<Tenant>(TENANT_KEY(slug));
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ tenant });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: {
    action?: string;
    reason?: string;
    limits?: Partial<TenantLimits>;
    signed_proof?: { signature: string; nonce: string };
    operator_wallet?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { action, reason = "", signed_proof, operator_wallet, limits } = body;

  if (!operator_wallet || !isOperator(operator_wallet)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  if (!signed_proof?.nonce || !signed_proof?.signature) {
    return NextResponse.json({ error: "missing_signed_proof" }, { status: 400 });
  }

  const verified = await verifySignedAction({
    wallet: operator_wallet,
    nonce: signed_proof.nonce,
    signature: signed_proof.signature,
    context: "ops_action",
  });
  if (!verified) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const before = await redis.get<Tenant>(TENANT_KEY(slug));
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const after: Tenant = { ...before };

  switch (action) {
    case "suspend":
      after.status = "suspended";
      break;
    case "reactivate":
      after.status = "active";
      break;
    case "revoke_delegation":
      if (after.delegated_signer) {
        after.delegated_signer = {
          ...after.delegated_signer,
          revoked_at: new Date().toISOString(),
        };
      }
      break;
    case "override_limits":
      if (!limits) {
        return NextResponse.json({ error: "missing_limits_field" }, { status: 400 });
      }
      after.limits = { ...after.limits, ...limits };
      break;
    default:
      return NextResponse.json({ error: "unknown_action", action }, { status: 400 });
  }

  await redis.set(TENANT_KEY(slug), after);

  await logAudit({
    actor_wallet: operator_wallet,
    action: action as string,
    target_slug: slug,
    before,
    after,
    reason,
  });

  return NextResponse.json({ ok: true, tenant: after });
}

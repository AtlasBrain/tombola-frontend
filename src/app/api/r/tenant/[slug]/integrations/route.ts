// PATCH /api/r/tenant/[slug]/integrations
//
// Updates tenant.integrations fields. Currently supports:
//   - discord_webhook_url: string | null  (null clears the webhook)
//
// Auth: requires a signed nonce from the tenant owner wallet.
// Pattern mirrors /api/r/tenant/[slug]/delegated-key (DELETE).

import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import { getTenant } from "@/lib/raas/tenant";
import { verifySignedAction } from "@/lib/raas/signed-action";
import type { TenantIntegrations } from "@/types/raas";

const redis = Redis.fromEnv();
const TENANT_KEY = (slug: string) => `raas:tenant:${slug}`;

interface RouteCtx {
  params: Promise<{ slug: string }>;
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const { slug } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    discord_webhook_url?: string | null;
    signed_proof?: { nonce: string; signature: string };
  } | null;

  if (!body?.signed_proof?.nonce || !body.signed_proof.signature) {
    return NextResponse.json({ error: "missing_signed_proof" }, { status: 400 });
  }

  const tenant = await getTenant(slug);
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce: body.signed_proof.nonce,
    signature: body.signed_proof.signature,
    context: `update_integrations:${slug}`,
  });
  if (!verified) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  // Merge the submitted integration fields.
  const current: TenantIntegrations = tenant.integrations ?? {};
  const updated: TenantIntegrations = { ...current };

  if ("discord_webhook_url" in body) {
    if (body.discord_webhook_url === null || body.discord_webhook_url === "") {
      delete updated.discord_webhook_url;
    } else if (typeof body.discord_webhook_url === "string") {
      // Basic sanity check — must start with Discord's webhook domain.
      if (!body.discord_webhook_url.startsWith("https://discord.com/api/webhooks/") &&
          !body.discord_webhook_url.startsWith("https://discordapp.com/api/webhooks/")) {
        return NextResponse.json({ error: "invalid_webhook_url" }, { status: 422 });
      }
      updated.discord_webhook_url = body.discord_webhook_url;
    }
  }

  tenant.integrations = updated;
  await redis.set(TENANT_KEY(slug), tenant);

  return NextResponse.json({ ok: true });
}

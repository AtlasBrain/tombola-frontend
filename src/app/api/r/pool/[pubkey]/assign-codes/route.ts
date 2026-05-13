// POST /api/r/pool/[pubkey]/assign-codes
//
// Assigns unredeemed invite codes to friends (off-chain hint + notification
// trigger). Does NOT remove codes from the available set — they remain valid
// on-chain; this is purely an off-chain bookmark + notification dispatch.
//
// Notification strategy:
//   v1 notifications are localStorage-only (src/lib/notifications.ts).
//   There is no server → localStorage bridge. The approach mirrors the v1
//   pool-invite pattern: we store a per-wallet pending-invite list in Redis
//   under `raas:pending_invites:${wallet}`. A client-side hook (Phase G:
//   useRaasInviteNotifications) polls a companion GET endpoint and calls
//   pushNotification() for each pending entry.
//
//   Key shape:  raas:pending_invites:${friend_wallet}   (Redis list, lpush)
//   Payload:    { kind, tenant, tenant_display, pool, url, created_at }
//
//   This mirrors how v1 stores pool invites in KV
//   (/api/pool-invite/by-wallet/[wallet]) and surfaces them via
//   usePoolInviteNotifications — consistent pattern, no magic.

import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import { verifySignedAction } from "@/lib/raas/signed-action";
import { getTenant } from "@/lib/raas/tenant";

const redis = Redis.fromEnv();

const ASSIGNMENTS_KEY = (pool: string) => `raas:pool:${pool}:assignments`;
const PENDING_INVITES_KEY = (wallet: string) =>
  `raas:pending_invites:${wallet}`;

interface Assignment {
  friend_wallet: string;
  code: string;
}

interface PendingInvitePayload {
  kind: "raas_invite";
  tenant: string;
  tenant_display: string;
  pool: string;
  url: string;
  created_at: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;

  const body = (await req.json().catch(() => null)) as {
    tenant_slug?: string;
    assignments?: Assignment[];
    signed_proof?: { signature: string; nonce: string };
  } | null;

  if (
    !body?.tenant_slug ||
    !Array.isArray(body.assignments) ||
    body.assignments.length === 0 ||
    !body.signed_proof?.signature ||
    !body.signed_proof?.nonce
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tenant = await getTenant(body.tenant_slug);
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  }

  // Verify the request was signed by the tenant owner.
  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce: body.signed_proof.nonce,
    signature: body.signed_proof.signature,
    context: `assign_codes:${pubkey}`,
  });
  if (!verified) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  // Validate each assignment has required fields.
  for (const a of body.assignments) {
    if (!a.friend_wallet || !a.code) {
      return NextResponse.json(
        { error: "invalid_assignment", detail: "friend_wallet and code required" },
        { status: 400 },
      );
    }
  }

  // Persist assignments — append to the pool's assignment log in KV.
  const existing =
    (await redis.get<Assignment[]>(ASSIGNMENTS_KEY(pubkey))) ?? [];
  const merged = [...existing, ...body.assignments];
  await redis.set(ASSIGNMENTS_KEY(pubkey), merged);

  // Queue a pending-invite notification for each friend's wallet.
  // The friend's client polls raas:pending_invites:${wallet} via a companion
  // GET endpoint and surfaces notifications through pushNotification().
  const createdAt = new Date().toISOString();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://tombola.app";

  for (const a of body.assignments) {
    const inviteUrl = `${baseUrl}/r/${body.tenant_slug}/invite/${encodeURIComponent(a.code)}`;
    const payload: PendingInvitePayload = {
      kind: "raas_invite",
      tenant: body.tenant_slug,
      tenant_display: tenant.display_name,
      pool: pubkey,
      url: inviteUrl,
      created_at: createdAt,
    };
    // lpush prepends; the list is LIFO so newest invites surface first.
    await redis.lpush(PENDING_INVITES_KEY(a.friend_wallet), JSON.stringify(payload));
    // Cap the list to 50 entries per wallet to prevent unbounded growth.
    await redis.ltrim(PENDING_INVITES_KEY(a.friend_wallet), 0, 49);
  }

  return NextResponse.json({ ok: true, assigned: body.assignments.length });
}

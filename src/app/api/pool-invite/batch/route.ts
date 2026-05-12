// POST /api/pool-invite/batch — allocate N invites in a single signed
// call. Used at pool creation (FRIENDS mode allocates initial seats)
// and when the admin tab invites multiple friends at once.
//
// One signature, one nonce, N store writes. Partial failures are
// surfaced per-friend so the UI can mark which ones landed.

import { NextResponse } from "next/server";
import {
  createInvite,
  type InviteRow,
} from "@/lib/pool-invite-store";
import { verifySignedAction } from "@/lib/signed-action";
import { createInviteBatchMessage } from "@/lib/pool-invite-messages";
import { isRateLimited } from "@/lib/kv/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface BatchEntry {
  friend: string;
  code: string;
  proofsBase64: string[];
}

interface BatchBody {
  inviter: string;
  pool: string;
  friends: BatchEntry[];
  nonce: string;
  signatureBase58: string;
}

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
}

function looksLikeWallet(w: unknown): w is string {
  return typeof w === "string" && w.length >= 32 && w.length <= 44;
}

const MAX_BATCH = 100;

export async function POST(req: Request) {
  let body: BatchBody;
  try {
    body = (await req.json()) as BatchBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const { inviter, pool, friends, nonce, signatureBase58 } = body;

  if (!looksLikeWallet(inviter) || !looksLikeWallet(pool)) {
    return jsonError("Invalid wallet or pool", 400);
  }
  if (!Array.isArray(friends) || friends.length === 0) {
    return jsonError("friends[] must be a non-empty array", 400);
  }
  if (friends.length > MAX_BATCH) {
    return jsonError(`Batch capped at ${MAX_BATCH} per call`, 400);
  }
  for (const f of friends) {
    if (!looksLikeWallet(f.friend)) {
      return jsonError("Invalid friend wallet in batch", 400);
    }
    if (typeof f.code !== "string" || f.code.length === 0) {
      return jsonError("Invalid code in batch entry", 400);
    }
    if (!Array.isArray(f.proofsBase64)) {
      return jsonError("Invalid merkle proof in batch entry", 400);
    }
  }

  if (await isRateLimited("friend-write", inviter)) {
    return jsonError("Too many requests", 429, "rate_limited");
  }

  const messageBytes = new TextEncoder().encode(
    createInviteBatchMessage(
      pool,
      friends.map((f) => f.friend),
      nonce,
    ),
  );
  const authErr = await verifySignedAction({
    wallet: inviter,
    messageBytes,
    signatureBase58,
    nonce,
  });
  if (authErr) return jsonError(authErr, 401);

  const now = Date.now();
  // Fire all stores in parallel — each is independent. Partial failure is
  // possible (one friend already had an invite for this pool); surface
  // per-row so the UI can decide what to retry.
  const results = await Promise.all(
    friends.map(async (f) => {
      const row: InviteRow = {
        pool,
        friend: f.friend,
        inviter,
        code: f.code,
        proofsBase64: f.proofsBase64,
        createdAt: now,
        status: "sent",
      };
      const res = await createInvite(row);
      return { friend: f.friend, ok: res.ok, error: res.error };
    }),
  );

  return NextResponse.json({ results });
}

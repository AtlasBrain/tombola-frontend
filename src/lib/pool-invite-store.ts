// Server-side KV layer for "creator invites a friend directly to a
// private pool". Sits on top of the existing on-chain invite-code +
// Whitelisted-PDA + redeem-via-merkle-proof machinery — the only thing
// stored here is the code+proof allocation so the recipient can
// one-click redeem without the inviter messaging them a link.
//
// Schema:
//   pool-invite:{pool}:{friend}   = InviteRow JSON
//   pool-invites-by-wallet:{friend}  = Set<poolAddress>   // recipient inbox
//   pool-invites-by-pool:{pool}      = Set<friendWallet>  // creator admin view
//
// Lifecycle:
//   1. Creator allocates a code from their pool's pre-generated set,
//      ships {code, proofs} to the server signed by their wallet.
//   2. Recipient hits GET /api/pool-invite/by-wallet — sees metadata
//      (NOT the code) so the banner can render.
//   3. Recipient signs a claim message, server returns {code, proofs}
//      and marks the invite as redeemed. Recipient submits the
//      existing redeemInviteCodeWhitelist instruction on-chain.
//   4. (Optional) Creator may revoke an unredeemed invite, deleting the
//      row + freeing the code for re-allocation client-side.

import { getRedis } from "./kv/redis";

const INVITE_PREFIX = "pool-invite:";
const BY_WALLET_PREFIX = "pool-invites-by-wallet:";
const BY_POOL_PREFIX = "pool-invites-by-pool:";

export type InviteStatus = "sent" | "redeemed";

export interface InviteRow {
  pool: string;
  friend: string;
  inviter: string;
  /** The raffle invite code allocated to this friend. Bearer-shape but
   *  in Whitelist mode the on-chain PDA is keyed on the redeemer wallet,
   *  so a leaked code only lets the leaker whitelist THEIR OWN wallet —
   *  not the friend's. Still kept server-only behind a signed-claim
   *  challenge so the inviter's intent is preserved. */
  code: string;
  /** Merkle proof for the code, base64. Each step is one 32-byte hash. */
  proofsBase64: string[];
  /** Unix ms — when the inviter created the allocation. */
  createdAt: number;
  status: InviteStatus;
}

function inviteKey(pool: string, friend: string): string {
  return `${INVITE_PREFIX}${pool}:${friend}`;
}

/** Fetch an invite by (pool, friend). null when none exists. */
export async function getInvite(
  pool: string,
  friend: string,
): Promise<InviteRow | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<InviteRow>(inviteKey(pool, friend))) ?? null;
}

/** Create a new invite. Atomic SETNX on the (pool, friend) key — a
 *  duplicate create from the same creator gracefully no-ops and the
 *  caller surfaces "already invited" to the UI. */
export async function createInvite(
  row: InviteRow,
): Promise<{ ok: boolean; error?: string }> {
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };
  if (row.inviter === row.friend) {
    return { ok: false, error: "Cannot invite yourself." };
  }
  const acquired = await r.set(inviteKey(row.pool, row.friend), row, {
    nx: true,
  });
  if (!acquired) {
    return { ok: false, error: "This friend already has an invite for this pool." };
  }
  // Index sets are SADDs (idempotent). Pipeline = one round-trip.
  await r
    .pipeline()
    .sadd(`${BY_WALLET_PREFIX}${row.friend}`, row.pool)
    .sadd(`${BY_POOL_PREFIX}${row.pool}`, row.friend)
    .exec();
  return { ok: true };
}

/** Marks an invite as redeemed. Idempotent — re-calling on an already-
 *  redeemed row is a no-op. */
export async function markRedeemed(
  pool: string,
  friend: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };
  const row = await getInvite(pool, friend);
  if (!row) return { ok: false, error: "Invite not found." };
  if (row.status === "redeemed") return { ok: true };
  const updated: InviteRow = { ...row, status: "redeemed" };
  await r.set(inviteKey(pool, friend), updated);
  return { ok: true };
}

/** Delete an invite. Only the original inviter is allowed (caller is
 *  expected to have already verified the signed action). Returns the
 *  deleted row so callers can refund the code to localStorage. */
export async function revokeInvite(
  pool: string,
  friend: string,
  inviter: string,
): Promise<{ ok: boolean; error?: string; row?: InviteRow }> {
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };
  const row = await getInvite(pool, friend);
  if (!row) return { ok: false, error: "Invite not found." };
  if (row.inviter !== inviter) {
    return { ok: false, error: "Only the inviter can revoke." };
  }
  if (row.status === "redeemed") {
    return { ok: false, error: "Cannot revoke a redeemed invite." };
  }
  await r
    .pipeline()
    .del(inviteKey(pool, friend))
    .srem(`${BY_WALLET_PREFIX}${friend}`, pool)
    .srem(`${BY_POOL_PREFIX}${pool}`, friend)
    .exec();
  return { ok: true, row };
}

/** Public metadata about an invite — safe to expose without the inviter
 *  or recipient signing. Drops `code` and `proofsBase64`. */
export interface InvitePublicView {
  pool: string;
  friend: string;
  inviter: string;
  createdAt: number;
  status: InviteStatus;
}

export function publicView(row: InviteRow): InvitePublicView {
  return {
    pool: row.pool,
    friend: row.friend,
    inviter: row.inviter,
    createdAt: row.createdAt,
    status: row.status,
  };
}

/** All invites for a friend's inbox. Metadata only — the redeem secret
 *  is gated behind a separate signed claim endpoint. */
export async function getInvitesForWallet(
  wallet: string,
): Promise<InvitePublicView[]> {
  const r = getRedis();
  if (!r) return [];
  const pools = (await r.smembers(`${BY_WALLET_PREFIX}${wallet}`)) as string[];
  if (pools.length === 0) return [];
  const rows = await Promise.all(pools.map((p) => getInvite(p, wallet)));
  return rows
    .filter((row): row is InviteRow => row !== null)
    .map(publicView)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** All invites a creator has issued for a pool — used by the admin tab. */
export async function getInvitesForPool(
  pool: string,
): Promise<InvitePublicView[]> {
  const r = getRedis();
  if (!r) return [];
  const friends = (await r.smembers(`${BY_POOL_PREFIX}${pool}`)) as string[];
  if (friends.length === 0) return [];
  const rows = await Promise.all(friends.map((f) => getInvite(pool, f)));
  return rows
    .filter((row): row is InviteRow => row !== null)
    .map(publicView)
    .sort((a, b) => b.createdAt - a.createdAt);
}

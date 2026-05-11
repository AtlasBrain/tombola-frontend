// Wallet-to-wallet friend graph stored on Upstash Redis.
//
// Schema:
//   edge:{minWallet}:{maxWallet} = { status, requestedBy, ts }   // canonical, lex-ordered
//   friend-accepted:{wallet}      = Set<otherWallet>             // accepted friends
//   friend-pending-out:{wallet}   = Set<otherWallet>             // requests this wallet sent
//   friend-pending-in:{wallet}    = Set<otherWallet>             // requests this wallet received
//
// State derivation (viewer ↔ target):
//   no edge        → "strangers"
//   pending, requestedBy === viewer  → "pending-out"
//   pending, requestedBy === target  → "pending-in"
//   accepted       → "friends"
//   viewer === target               → "self"
//
// All mutations are wallet-signature gated (see verifyFriendAction below).

import nacl from "tweetnacl";
import { decodeBase58 } from "./base58";
import { consumeNonce } from "./profile-store";
import { getRedis } from "./kv/redis";

const EDGE_PREFIX = "edge:";
const ACCEPTED_PREFIX = "friend-accepted:";
const PENDING_OUT_PREFIX = "friend-pending-out:";
const PENDING_IN_PREFIX = "friend-pending-in:";

export type EdgeStatus = "pending" | "accepted";

export interface EdgeRow {
  status: EdgeStatus;
  requestedBy: string;
  ts: number;
}

export type Relationship =
  | "self"
  | "strangers"
  | "pending-out"
  | "pending-in"
  | "friends";

/** Lex order — used so we store each edge exactly once regardless of which
 *  side initiates the request. */
function edgeKey(a: string, b: string): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${EDGE_PREFIX}${lo}:${hi}`;
}

async function getEdge(a: string, b: string): Promise<EdgeRow | null> {
  const r = getRedis();
  if (!r) return null;
  return (await r.get<EdgeRow>(edgeKey(a, b))) ?? null;
}

/** Returns the relationship between `viewer` and `target` from `viewer`'s
 *  perspective. Used by the ProfileCard to pick which button to render. */
export async function getRelationship(
  viewer: string,
  target: string,
): Promise<Relationship> {
  if (viewer === target) return "self";
  const edge = await getEdge(viewer, target);
  if (!edge) return "strangers";
  if (edge.status === "accepted") return "friends";
  return edge.requestedBy === viewer ? "pending-out" : "pending-in";
}

export interface FriendListsRow {
  /** Accepted friend wallets. */
  friends: string[];
  /** Requests this wallet has received and not yet responded to. */
  pendingIn: string[];
  /** Requests this wallet has sent and that haven't been accepted yet. */
  pendingOut: string[];
}

/** Bulk load the three lists in a single round-trip (using Redis pipeline). */
export async function getFriendLists(
  wallet: string,
): Promise<FriendListsRow> {
  const r = getRedis();
  if (!r) return { friends: [], pendingIn: [], pendingOut: [] };
  const [friends, pendingIn, pendingOut] = await Promise.all([
    r.smembers(`${ACCEPTED_PREFIX}${wallet}`),
    r.smembers(`${PENDING_IN_PREFIX}${wallet}`),
    r.smembers(`${PENDING_OUT_PREFIX}${wallet}`),
  ]);
  return {
    friends: (friends ?? []) as string[],
    pendingIn: (pendingIn ?? []) as string[],
    pendingOut: (pendingOut ?? []) as string[],
  };
}

export async function getFriendCount(wallet: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const n = await r.scard(`${ACCEPTED_PREFIX}${wallet}`);
  return Number(n ?? 0);
}

// ───────────────────────────── mutations ─────────────────────────────

/** Send a friend request from `from` to `to`. Idempotent only for the
 *  initial "pending" state — if there's already an accepted edge OR a
 *  pending edge in the opposite direction, callers should handle that
 *  client-side (the API route surfaces a friendly error). */
export async function sendFriendRequest(
  from: string,
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  if (from === to) return { ok: false, error: "Cannot friend yourself." };
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };

  const existing = await getEdge(from, to);
  if (existing) {
    if (existing.status === "accepted") return { ok: false, error: "Already friends." };
    if (existing.requestedBy === from) return { ok: false, error: "Request already sent." };
    // Other side already invited the caller — return a soft prompt; we
    // could auto-accept here, but the user might have forgotten and we
    // prefer the explicit "accept" path.
    return { ok: false, error: "This wallet already invited you — accept their request instead." };
  }

  const row: EdgeRow = {
    status: "pending",
    requestedBy: from,
    ts: Date.now(),
  };
  await Promise.all([
    r.set(edgeKey(from, to), row),
    r.sadd(`${PENDING_OUT_PREFIX}${from}`, to),
    r.sadd(`${PENDING_IN_PREFIX}${to}`, from),
  ]);
  return { ok: true };
}

/** `responder` responds to a pending request from `initiator`. */
export async function respondToFriendRequest(
  responder: string,
  initiator: string,
  accept: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };

  const edge = await getEdge(responder, initiator);
  if (!edge || edge.status !== "pending" || edge.requestedBy !== initiator) {
    return { ok: false, error: "No pending request from that wallet." };
  }

  const pendingCleanup = [
    r.srem(`${PENDING_OUT_PREFIX}${initiator}`, responder),
    r.srem(`${PENDING_IN_PREFIX}${responder}`, initiator),
  ];

  if (accept) {
    const accepted: EdgeRow = {
      status: "accepted",
      requestedBy: initiator,
      ts: edge.ts,
    };
    await Promise.all([
      r.set(edgeKey(responder, initiator), accepted),
      r.sadd(`${ACCEPTED_PREFIX}${responder}`, initiator),
      r.sadd(`${ACCEPTED_PREFIX}${initiator}`, responder),
      ...pendingCleanup,
    ]);
  } else {
    await Promise.all([
      r.del(edgeKey(responder, initiator)),
      ...pendingCleanup,
    ]);
  }
  return { ok: true };
}

/** Either side can call this — drops an accepted edge AND removes both
 *  wallets from each other's accepted set. Also cancels a still-pending
 *  outgoing request when called by the requester. */
export async function unfriend(
  caller: string,
  other: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = getRedis();
  if (!r) return { ok: false, error: "Store not configured." };
  const edge = await getEdge(caller, other);
  if (!edge) return { ok: false, error: "No relationship to remove." };

  if (edge.status === "accepted") {
    await Promise.all([
      r.del(edgeKey(caller, other)),
      r.srem(`${ACCEPTED_PREFIX}${caller}`, other),
      r.srem(`${ACCEPTED_PREFIX}${other}`, caller),
    ]);
    return { ok: true };
  }

  // Pending — cancellable only by the requester.
  if (edge.requestedBy !== caller) {
    return { ok: false, error: "Only the requester can cancel a pending invite." };
  }
  await Promise.all([
    r.del(edgeKey(caller, other)),
    r.srem(`${PENDING_OUT_PREFIX}${caller}`, other),
    r.srem(`${PENDING_IN_PREFIX}${other}`, caller),
  ]);
  return { ok: true };
}

// ───────────────────────────── signed-action auth ────────────────────────

/** Action verbs the client can sign for. Each one carries its own message
 *  shape so a signature for one action can't be replayed as another. */
export type FriendAction = "request" | "accept" | "reject" | "unfriend";

export function friendActionMessage(
  action: FriendAction,
  target: string,
  nonce: string,
): string {
  return `tombola:friend:${action}:${target}:${nonce}`;
}

interface SignedFriendCall {
  wallet: string;
  target: string;
  action: FriendAction;
  nonce: string;
  signatureBase58: string;
}

/** Verify the client-supplied signature was made by `wallet` over the
 *  expected friend-action message, then consume the nonce. Returns null on
 *  success, an error string otherwise. */
export async function verifyFriendAction(
  call: SignedFriendCall,
): Promise<string | null> {
  const { wallet, target, action, nonce, signatureBase58 } = call;
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return "Invalid wallet pubkey.";
  }
  if (typeof target !== "string" || target.length < 32 || target.length > 44) {
    return "Invalid target pubkey.";
  }
  if (typeof nonce !== "string" || nonce.length !== 64) {
    return "Invalid nonce.";
  }
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = decodeBase58(wallet);
    sigBytes = decodeBase58(signatureBase58);
  } catch {
    return "Invalid base58 in wallet or signature.";
  }
  if (pubkeyBytes.length !== 32) return "Wallet pubkey must be 32 bytes.";
  if (sigBytes.length !== 64) return "Signature must be 64 bytes.";

  const message = new TextEncoder().encode(
    friendActionMessage(action, target, nonce),
  );
  if (!nacl.sign.detached.verify(message, sigBytes, pubkeyBytes)) {
    return "Signature does not match wallet pubkey.";
  }

  const consumed = await consumeNonce(wallet, nonce);
  if (!consumed) return "Nonce expired or already used.";
  return null;
}


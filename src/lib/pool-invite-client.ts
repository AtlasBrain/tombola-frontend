// Client-side helpers for the /api/pool-invite/* endpoints.
//
// Each mutation runs the same nonce-then-sign-then-POST handshake as
// friend actions and profile edits. The recipient's claim flow is
// special: server response carries the redemption code + merkle proof
// the recipient then plugs into an on-chain redeem instruction.

import type { WalletContextState } from "@solana/wallet-adapter-react";
import { encodeBase58 } from "./base58";
import {
  claimInviteMessage,
  createInviteBatchMessage,
  createInviteMessage,
  revokeInviteMessage,
} from "./pool-invite-messages";

async function getNonce(wallet: string): Promise<string> {
  const res = await fetch(`/api/profile/nonce/${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nonce ${res.status}`);
  return ((await res.json()) as { nonce: string }).nonce;
}

async function signMessageBase58(
  signMessage: NonNullable<WalletContextState["signMessage"]>,
  message: string,
): Promise<string> {
  const sig = await signMessage(new TextEncoder().encode(message));
  return encodeBase58(sig);
}

// ─────────────────────────────  Inviter (creator)  ─────────────────────────────

export interface CreateInviteArgs {
  inviter: string;
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  pool: string;
  friend: string;
  code: string;
  proofsBase64: string[];
}

/** Allocate a code from the creator's locally-stored set to a friend's
 *  wallet. Server stores {code, proofsBase64} under (pool, friend) and
 *  pushes the pool address onto the friend's inbox set. */
export async function createPoolInvite(args: CreateInviteArgs): Promise<void> {
  const nonce = await getNonce(args.inviter);
  const signatureBase58 = await signMessageBase58(
    args.signMessage,
    createInviteMessage(args.pool, args.friend, nonce),
  );
  const res = await fetch("/api/pool-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviter: args.inviter,
      pool: args.pool,
      friend: args.friend,
      code: args.code,
      proofsBase64: args.proofsBase64,
      nonce,
      signatureBase58,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `create invite ${res.status}`);
  }
}

export interface BatchInviteEntry {
  friend: string;
  code: string;
  proofsBase64: string[];
}

export interface BatchInviteArgs {
  inviter: string;
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  pool: string;
  friends: BatchInviteEntry[];
}

export interface BatchInviteResult {
  friend: string;
  ok: boolean;
  error?: string;
}

/** Allocate codes to N friends in a single signed call. Used at pool
 *  creation (FRIENDS mode bakes initial seats) and in the admin tab. */
export async function createPoolInviteBatch(
  args: BatchInviteArgs,
): Promise<BatchInviteResult[]> {
  if (args.friends.length === 0) return [];
  const nonce = await getNonce(args.inviter);
  const signatureBase58 = await signMessageBase58(
    args.signMessage,
    createInviteBatchMessage(
      args.pool,
      args.friends.map((f) => f.friend),
      nonce,
    ),
  );
  const res = await fetch("/api/pool-invite/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviter: args.inviter,
      pool: args.pool,
      friends: args.friends,
      nonce,
      signatureBase58,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `batch invite ${res.status}`);
  }
  return ((await res.json()) as { results: BatchInviteResult[] }).results;
}

export interface RevokeInviteArgs {
  inviter: string;
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  pool: string;
  friend: string;
}

/** Revoke an unredeemed invite. Server returns the original
 *  {code, proofsBase64} so the client can re-allocate it. */
export async function revokePoolInvite(
  args: RevokeInviteArgs,
): Promise<{ code: string; proofsBase64: string[] }> {
  const nonce = await getNonce(args.inviter);
  const signatureBase58 = await signMessageBase58(
    args.signMessage,
    revokeInviteMessage(args.pool, args.friend, nonce),
  );
  const res = await fetch("/api/pool-invite", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviter: args.inviter,
      pool: args.pool,
      friend: args.friend,
      nonce,
      signatureBase58,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `revoke invite ${res.status}`);
  }
  return (await res.json()) as { code: string; proofsBase64: string[] };
}

// ─────────────────────────────  Recipient  ───────────────────────────────────

export type InviteStatus = "sent" | "redeemed";

export interface InvitePublicView {
  pool: string;
  friend: string;
  inviter: string;
  createdAt: number;
  status: InviteStatus;
}

export async function getInvitesForWallet(
  wallet: string,
): Promise<InvitePublicView[]> {
  const res = await fetch(
    `/api/pool-invite/by-wallet/${encodeURIComponent(wallet)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`inbox ${res.status}`);
  return ((await res.json()) as { invites: InvitePublicView[] }).invites;
}

export async function getInvitesForPool(
  pool: string,
): Promise<InvitePublicView[]> {
  const res = await fetch(
    `/api/pool-invite/by-pool/${encodeURIComponent(pool)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`pool invites ${res.status}`);
  return ((await res.json()) as { invites: InvitePublicView[] }).invites;
}

export interface ClaimInviteArgs {
  wallet: string;
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  pool: string;
}

/** Recipient retrieves the code + proof so they can submit the on-chain
 *  redeem themselves. Marks the invite redeemed server-side; the
 *  caller is responsible for actually broadcasting the tx. */
export async function claimPoolInvite(
  args: ClaimInviteArgs,
): Promise<{ code: string; proofsBase64: string[]; inviter: string }> {
  const nonce = await getNonce(args.wallet);
  const signatureBase58 = await signMessageBase58(
    args.signMessage,
    claimInviteMessage(args.pool, nonce),
  );
  const res = await fetch("/api/pool-invite/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: args.wallet,
      pool: args.pool,
      nonce,
      signatureBase58,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `claim ${res.status}`);
  }
  return (await res.json()) as {
    code: string;
    proofsBase64: string[];
    inviter: string;
  };
}

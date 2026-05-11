// Client-side helpers for /api/friends/*.
//
// Same nonce flow as profile edits: GET /api/profile/nonce/<wallet> →
// signMessage("tombola:friend:<action>:<target>:<nonce>") → POST /api/friends.

import type { WalletContextState } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

export type FriendAction = "request" | "accept" | "reject" | "unfriend";

export type Relationship =
  | "self"
  | "strangers"
  | "pending-out"
  | "pending-in"
  | "friends";

function bs58Encode(bytes: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = bs58 as any;
  const encode = (lib.default?.encode ?? lib.encode) as (b: Uint8Array) => string;
  return encode(bytes);
}

async function getNonce(wallet: string): Promise<string> {
  const res = await fetch(`/api/profile/nonce/${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`nonce ${res.status}`);
  return ((await res.json()) as { nonce: string }).nonce;
}

export async function getFriendState(
  viewer: string,
  target: string,
): Promise<Relationship> {
  const res = await fetch(
    `/api/friends/state/${encodeURIComponent(viewer)}/${encodeURIComponent(target)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`friend state ${res.status}`);
  return ((await res.json()) as { relationship: Relationship }).relationship;
}

export interface FriendListsResponse {
  friends: string[];
  pendingIn: string[];
  pendingOut: string[];
  count: number;
}

export async function getFriendLists(
  wallet: string,
): Promise<FriendListsResponse> {
  const res = await fetch(`/api/friends/${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`friend lists ${res.status}`);
  return (await res.json()) as FriendListsResponse;
}

export interface SendFriendActionArgs {
  wallet: string;
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  target: string;
  action: FriendAction;
}

export async function sendFriendAction({
  wallet,
  signMessage,
  target,
  action,
}: SendFriendActionArgs): Promise<void> {
  const nonce = await getNonce(wallet);
  const message = new TextEncoder().encode(
    `tombola:friend:${action}:${target}:${nonce}`,
  );
  const signature = await signMessage(message);
  const signatureBase58 = bs58Encode(signature);

  const res = await fetch("/api/friends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      target,
      action,
      nonce,
      signatureBase58,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `friend action ${res.status}`);
  }
}

// Client-side helpers for talking to /api/profile/*.
//
// The full edit flow:
//   1. fetch /api/profile/nonce/<wallet>  -> { nonce }
//   2. ask the wallet to signMessage("tombola:profile-edit:" + nonce)
//   3. POST /api/profile/me with { wallet, nonce, signatureBase58, patch }
// The signature is verified server-side (see profile-auth.ts). No JWTs.

import type { WalletContextState } from "@solana/wallet-adapter-react";
import { encodeBase58 } from "./base58";

const MESSAGE_PREFIX = "tombola:profile-edit:";

export interface ProfileRow {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  xVerified: boolean;
  isPublic: boolean;
  avatar:
    | null
    | { kind: "nft"; mint: string }
    | { kind: "upload"; url: string };
  createdAt: number;
  updatedAt: number;
}

export type ProfilePatch = Partial<
  Pick<ProfileRow, "pseudo" | "xHandle" | "isPublic" | "avatar">
>;

export async function fetchProfile(handle: string): Promise<ProfileRow | null> {
  const res = await fetch(`/api/profile/${encodeURIComponent(handle)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchProfile: ${res.status}`);
  const j = (await res.json()) as { profile: ProfileRow };
  return j.profile;
}

/** Issue a fresh nonce for `wallet`. The nonce is consumed by the next
 *  successful PUT — replays after that won't verify. */
async function getNonce(wallet: string): Promise<string> {
  const res = await fetch(`/api/profile/nonce/${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`getNonce: ${res.status}`);
  const j = (await res.json()) as { nonce: string };
  return j.nonce;
}

export interface EditProfileArgs {
  wallet: string;
  /** Must be `useWallet()` with `signMessage` available. Phantom + Solflare both expose it. */
  signMessage: NonNullable<WalletContextState["signMessage"]>;
  patch: ProfilePatch;
}

export async function editProfile({
  wallet,
  signMessage,
  patch,
}: EditProfileArgs): Promise<ProfileRow> {
  const nonce = await getNonce(wallet);
  const message = new TextEncoder().encode(MESSAGE_PREFIX + nonce);
  const signature = await signMessage(message);
  const signatureBase58 = encodeBase58(signature);

  const res = await fetch("/api/profile/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, nonce, signatureBase58, patch }),
  });
  const j = (await res.json()) as { profile?: ProfileRow; error?: string };
  if (!res.ok) {
    throw new Error(j.error ?? `editProfile failed: ${res.status}`);
  }
  return j.profile as ProfileRow;
}

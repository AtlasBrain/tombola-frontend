// Wallet-keyed profile storage on Upstash Redis.
//
// Schema:
//   profile:{wallet}            JSON ProfileRow
//   pseudo:{lowercase}          wallet  (uniqueness index; lowercase for case-insensitive claim)
//   nonce:{wallet}              random 32-byte hex (1-shot signature challenge, TTL 5min)
//
// All mutations require a wallet signature over a server-issued nonce; see
// `src/lib/profile-auth.ts`. This file is the bare KV layer — no auth here.

import { Redis } from "@upstash/redis";

const PROFILE_PREFIX = "profile:";
const PSEUDO_PREFIX = "pseudo:";
const NONCE_PREFIX = "nonce:";
const NONCE_TTL_SEC = 300;

/** Lazy-init Redis client so build-time / lint-time importers don't crash on
 *  missing env vars. Returns null when Upstash isn't configured (local dev
 *  without env). Callers must handle null gracefully — fall back to empty
 *  profile is fine.
 *
 *  We accept both naming conventions because Vercel's Upstash Marketplace
 *  integration injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (legacy KV
 *  branding), while a direct Upstash signup uses `UPSTASH_REDIS_REST_URL` /
 *  `UPSTASH_REDIS_REST_TOKEN`. Either pair works. */
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis !== null) return redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export interface ProfileRow {
  /** Base58 wallet pubkey — the canonical id, set on first save. */
  wallet: string;
  /** Self-set display name. 3–24 chars, [a-z0-9_]. Unique (case-insensitive). */
  pseudo: string | null;
  /** Self-claimed X / Twitter handle, without the @. Verification flag is
   *  separate so we can add the sign-and-tweet flow later. */
  xHandle: string | null;
  /** Reserved for future X-verification flow. Always false in V1. */
  xVerified: boolean;
  /** Privacy toggle. When false, the public profile page hides stats /
   *  activity / badges and shows only pseudo + avatar + wallet + the
   *  friend-request button. */
  isPublic: boolean;
  /** Avatar source. null = generated identicon from wallet bytes. NFT or
   *  uploaded image variants are deferred to a later phase. */
  avatar:
    | null
    | { kind: "nft"; mint: string }
    | { kind: "upload"; url: string };
  /** Unix ms — when the row was first created. */
  createdAt: number;
  /** Unix ms — last update. */
  updatedAt: number;
}

export function defaultProfile(wallet: string): ProfileRow {
  const now = Date.now();
  return {
    wallet,
    pseudo: null,
    xHandle: null,
    xVerified: false,
    isPublic: true,
    avatar: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Fetch by wallet. Returns null when no row exists (caller can render an
 *  unclaimed-profile view). */
export async function getProfileByWallet(
  wallet: string,
): Promise<ProfileRow | null> {
  const r = getRedis();
  if (!r) return null;
  const raw = await r.get<ProfileRow>(`${PROFILE_PREFIX}${wallet}`);
  return raw ?? null;
}

/** Resolve a pseudo (case-insensitive) to its wallet, then load the profile.
 *  Used by the /u/[handle] page when the URL segment isn't a base58 pubkey. */
export async function getProfileByPseudo(
  pseudo: string,
): Promise<ProfileRow | null> {
  const r = getRedis();
  if (!r) return null;
  const wallet = await r.get<string>(
    `${PSEUDO_PREFIX}${pseudo.toLowerCase()}`,
  );
  if (!wallet) return null;
  return getProfileByWallet(wallet);
}

/** Check whether a pseudo is available. Available = not in the index, OR
 *  pointing at the same wallet making the claim (idempotent re-save). */
export async function isPseudoAvailable(
  pseudo: string,
  claimingWallet: string,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // KV unavailable; let the write fail downstream
  const existing = await r.get<string>(
    `${PSEUDO_PREFIX}${pseudo.toLowerCase()}`,
  );
  return existing === null || existing === claimingWallet;
}

const PSEUDO_RE = /^[a-z0-9_]{3,24}$/;
/** Server-side validator. Returns null when valid, an error string otherwise. */
export function validatePseudo(pseudo: string): string | null {
  if (typeof pseudo !== "string") return "Pseudo must be a string.";
  if (!PSEUDO_RE.test(pseudo.toLowerCase())) {
    return "Pseudo must be 3–24 chars of letters, digits, or underscore.";
  }
  return null;
}

/** Save or update a profile. Atomically updates the pseudo index when the
 *  pseudo changes; releases the prior pseudo so it becomes claimable again. */
export async function saveProfile(
  next: ProfileRow,
  prev: ProfileRow | null,
): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error("Profile store not configured (Upstash env missing)");

  const writes: Promise<unknown>[] = [
    r.set(`${PROFILE_PREFIX}${next.wallet}`, next),
  ];
  if (next.pseudo) {
    writes.push(
      r.set(`${PSEUDO_PREFIX}${next.pseudo.toLowerCase()}`, next.wallet),
    );
  }
  // Release the old pseudo if it changed (so other wallets can claim it).
  if (prev?.pseudo && prev.pseudo !== next.pseudo) {
    writes.push(r.del(`${PSEUDO_PREFIX}${prev.pseudo.toLowerCase()}`));
  }
  await Promise.all(writes);
}

// ───────────────────────────── auth nonce helpers ─────────────────────────

/** Issue a one-time nonce for the wallet to sign. TTL = 5 minutes; replaced
 *  on each request (a fresh nonce per edit-session is fine). */
export async function issueNonce(wallet: string): Promise<string> {
  const r = getRedis();
  if (!r) throw new Error("Profile store not configured");
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  await r.set(`${NONCE_PREFIX}${wallet}`, hex, { ex: NONCE_TTL_SEC });
  return hex;
}

/** Consume the nonce — returns true if the nonce matches what we issued and
 *  hadn't been used yet. Deletes the nonce on a successful match (single-use). */
export async function consumeNonce(
  wallet: string,
  nonce: string,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  const stored = await r.get<string>(`${NONCE_PREFIX}${wallet}`);
  if (!stored || stored !== nonce) return false;
  await r.del(`${NONCE_PREFIX}${wallet}`);
  return true;
}

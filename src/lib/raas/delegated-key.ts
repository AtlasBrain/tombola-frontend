// src/lib/raas/delegated-key.ts — Delegated hot-key store/load helpers.
//
// The delegated private key is encrypted at rest using AES-256-GCM with the
// tenant's code_key (already provisioned in Phase A / Task A3). This means
// all tenant-owned crypto material lives under one shared encryption key per
// tenant. The key is never stored or transmitted in plaintext.
import "server-only";
import { Redis } from "@upstash/redis";
import nacl from "tweetnacl";
import bs58 from "bs58";

const redis = Redis.fromEnv();

const DELEGATED_KEY_PRIVATE = (slug: string) =>
  `raas:tenant:${slug}:delegated_private`;

// ── AES-GCM helpers ───────────────────────────────────────────────────────────

/** Copy Uint8Array into a fresh ArrayBuffer (never SharedArrayBuffer). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypts `privateKeyBytes` with AES-256-GCM using `encryptionKeyBytes`,
 * then stores the ciphertext + iv in Redis under the tenant's delegated key slot.
 * The plaintext is never persisted.
 */
export async function storeDelegatedKey(
  slug: string,
  privateKeyBytes: Uint8Array,
  encryptionKeyBytes: Uint8Array,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encryptionKeyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(privateKeyBytes),
  );
  await redis.set(DELEGATED_KEY_PRIVATE(slug), {
    ct: Buffer.from(new Uint8Array(ct)).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
  });
}

/**
 * Loads and decrypts the tenant's delegated private key.
 * Returns `null` if no key is stored (e.g. not provisioned or already revoked).
 * Throws if decryption fails (wrong key / tampered ciphertext).
 */
export async function loadDelegatedKey(
  slug: string,
  encryptionKeyBytes: Uint8Array,
): Promise<Uint8Array | null> {
  const stored = await redis.get<{ ct: string; iv: string }>(
    DELEGATED_KEY_PRIVATE(slug),
  );
  if (!stored) return null;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encryptionKeyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(new Uint8Array(Buffer.from(stored.iv, "base64"))),
    },
    cryptoKey,
    toArrayBuffer(new Uint8Array(Buffer.from(stored.ct, "base64"))),
  );
  return new Uint8Array(pt);
}

/**
 * Generates a fresh Ed25519 keypair via tweetnacl (browser-safe, pure JS).
 * Returns the base58-encoded public key and the 64-byte secret key
 * (nacl seed + public key concatenated, as expected by @solana/web3.js
 * `Keypair.fromSecretKey()`).
 */
export function generateDelegatedKeypair(): {
  publicKey: string;
  privateKey: Uint8Array;
} {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: bs58.encode(kp.publicKey),
    privateKey: kp.secretKey, // 64 bytes: 32-byte seed || 32-byte pubkey
  };
}

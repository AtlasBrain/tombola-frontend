// localStorage persistence for invite codes generated client-side at private-pool
// creation. Codes never reach the chain (only the Merkle root does), so the only
// way to re-display them after the creator navigates away is to persist locally.
//
// Schema is versioned. Cross-wallet leakage guard: loadCodesFromStorage requires
// the caller to pass the connected wallet, and returns null if the stored
// `creator` doesn't match.

import type { RedemptionMode } from "./private-pools";

const KEY_PREFIX = "tombola.privatePool.";
const SCHEMA_VERSION = 1;

export interface StoredCodesPayload {
  poolAddress: string;
  creator: string;
  createdAt: number; // unix seconds
  mode: RedemptionMode;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
}

interface OnDiskShape {
  schemaVersion: number;
  poolAddress: string;
  creator: string;
  createdAt: number;
  mode: RedemptionMode;
  codes: string[];
  // Uint8Array isn't JSON-serializable; on disk each proof step is a base64url string.
  proofs: Record<string, string[]>;
}

export function saveCodesToStorage(payload: StoredCodesPayload): void {
  const onDisk: OnDiskShape = {
    schemaVersion: SCHEMA_VERSION,
    poolAddress: payload.poolAddress,
    creator: payload.creator,
    createdAt: payload.createdAt,
    mode: payload.mode,
    codes: payload.codes,
    proofs: Object.fromEntries(
      Object.entries(payload.proofs).map(([code, steps]) => [
        code,
        steps.map(bytesToBase64Url),
      ]),
    ),
  };
  localStorage.setItem(
    `${KEY_PREFIX}${payload.poolAddress}`,
    JSON.stringify(onDisk),
  );
}

export function loadCodesFromStorage(
  poolAddress: string,
  walletAddress: string,
): StoredCodesPayload | null {
  const raw = localStorage.getItem(`${KEY_PREFIX}${poolAddress}`);
  if (!raw) return null;
  let parsed: OnDiskShape;
  try {
    parsed = JSON.parse(raw) as OnDiskShape;
  } catch {
    return null;
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
  if (parsed.creator !== walletAddress) return null;
  return {
    poolAddress: parsed.poolAddress,
    creator: parsed.creator,
    createdAt: parsed.createdAt,
    mode: parsed.mode,
    codes: parsed.codes,
    proofs: Object.fromEntries(
      Object.entries(parsed.proofs).map(([code, steps]) => [
        code,
        steps.map(base64UrlToBytes),
      ]),
    ),
  };
}

export function loadAllCodesForWallet(
  walletAddress: string,
): StoredCodesPayload[] {
  const out: StoredCodesPayload[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const poolAddress = key.slice(KEY_PREFIX.length);
    const loaded = loadCodesFromStorage(poolAddress, walletAddress);
    if (loaded) out.push(loaded);
  }
  return out;
}

export function removeCodesFromStorage(poolAddress: string): void {
  localStorage.removeItem(`${KEY_PREFIX}${poolAddress}`);
}

// ---------- base64url helpers (browser + happy-dom compatible) ----------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === "function"
      ? btoa(s)
      : Buffer.from(s, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

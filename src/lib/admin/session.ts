// Admin session cookies.
//
// After a wallet proves it owns a private key (via the signed-nonce flow),
// we mint a short-lived bearer cookie so subsequent /api/admin/* calls
// don't have to re-sign every request. The cookie value is:
//
//     base64url(JSON({ wallet, exp })).hex(hmac-sha256(payload, secret))
//
// Security model:
//   • httpOnly + Secure + SameSite=Lax — set on the response by the
//     route, not by this module (we just produce the value).
//   • HMAC-SHA256 binds the payload to the server's ADMIN_SESSION_SECRET.
//     Without that secret, a client can't forge a valid cookie.
//   • Constant-time signature comparison to defeat timing side-channels.
//   • Short TTL (15 min). No "refresh" mechanism in v1 — when it expires,
//     the user re-signs. Sliding TTL is a phase-5 enhancement.
//
// We deliberately keep this dependency-free: only Node's built-in
// `crypto`. No JWT library, no Redis lookup on the verify path —
// stateless verification keeps the admin gate cheap even in edge runtime.

import { createHmac, timingSafeEqual } from "crypto";

export interface AdminSessionPayload {
  /** Admin wallet pubkey, base58. */
  wallet: string;
  /** Expiry — unix seconds. */
  exp: number;
}

/** Default cookie name. The route layer references this — keep
 *  hard-coded so accidental mismatches between sign + verify can't
 *  happen. */
export const ADMIN_SESSION_COOKIE = "tombola_admin_session";

/** Default TTL in seconds (15 minutes). */
export const DEFAULT_TTL_SEC = 15 * 60;

/** Per-route header used to surface authenticated wallet downstream. */
export const ADMIN_WALLET_HEADER = "x-admin-wallet";

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) {
    // Fail loud — a short secret defeats the whole purpose. Don't fall
    // back silently to a hardcoded value: that would let an admin
    // session pass on a misconfigured deployment.
    throw new Error(
      "ADMIN_SESSION_SECRET must be set to a random string ≥ 32 chars.",
    );
  }
  return s;
}

function b64urlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  // Pad back to multiple of 4 for atob compatibility.
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(std, "base64");
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Mint a fresh session token for `wallet`. Returns the cookie value
 *  string — caller is responsible for `Set-Cookie` flags. */
export function signSession(
  wallet: string,
  opts: { ttlSec?: number; nowSec?: number } = {},
): string {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const payload: AdminSessionPayload = { wallet, exp: now + ttl };
  const encoded = b64urlEncode(JSON.stringify(payload));
  const sig = hmac(getSecret(), encoded);
  return `${encoded}.${sig}`;
}

/** Verify a session cookie. Returns the payload on success, null on any
 *  failure (malformed, expired, bad signature, wrong wallet shape). */
export function verifySession(
  token: string | null | undefined,
  opts: { nowSec?: number } = {},
): AdminSessionPayload | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected: string;
  try {
    expected = hmac(getSecret(), encoded);
  } catch {
    return null;
  }
  if (sig.length !== expected.length) return null;
  // Constant-time compare. Both are hex strings of equal length, so we
  // can buffer them directly.
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.wallet !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  // Reasonable shape gate on the wallet — base58 pubkeys are 32–44 chars.
  if (payload.wallet.length < 32 || payload.wallet.length > 44) return null;
  return payload;
}

/** Build the exact message the admin must sign with their wallet to
 *  prove ownership during login. Keep in sync with the client signer
 *  in src/lib/admin/admin-client.ts. */
export function adminLoginMessage(nonce: string): string {
  return `tombola:admin-session:${nonce}`;
}

// src/app/api/r/pool/[pubkey]/code-proof/route.ts
//
// Public endpoint: given a pool pubkey + invite code, decrypts the full code
// set server-side and returns the Merkle proof for that specific code.
//
// Why public? The codes themselves are the secret. A proof only reveals
// positional info about a code that the caller already holds. Any invitee who
// has a valid code can use this endpoint to obtain their proof for redemption.
//
// Rate-limited to 10 requests per minute per IP (Ratelimit.fixedWindow) to
// prevent brute-force enumeration of code→proof relationships.
import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { decryptCodes, type EncryptedCodeSet } from "@/lib/raas/code-storage";
import { buildCodeTree } from "@tombola/sdk-v2/codes";

const redis = Redis.fromEnv();

const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, "1 m"),
  prefix: "raas:code-proof:rl",
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  // Rate limit per IP before doing any KV reads.
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = await limiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { pubkey } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tenantSlug = url.searchParams.get("tenant");

  if (!code || !tenantSlug) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Fetch the encrypted code set and the tenant's encryption key.
  const stored = await redis.get<{ ciphertext: string; iv: string; count: number }>(
    `raas:pool:${pubkey}:codes`,
  );
  if (!stored) {
    return NextResponse.json({ error: "no_codes" }, { status: 404 });
  }
  const keyB64 = await redis.get<string>(`raas:tenant:${tenantSlug}:code_key`);
  if (!keyB64) {
    return NextResponse.json({ error: "no_key" }, { status: 500 });
  }

  // Decrypt the full code set server-side.
  const payload: EncryptedCodeSet = {
    ciphertext: new Uint8Array(Buffer.from(stored.ciphertext, "base64")),
    iv: new Uint8Array(Buffer.from(stored.iv, "base64")),
    count: stored.count,
  };
  const keyBytes = new Uint8Array(Buffer.from(keyB64, "base64"));
  const codes = await decryptCodes(payload, keyBytes);

  // Verify the code is in the set before computing its proof.
  if (!codes.includes(code)) {
    return NextResponse.json({ error: "code_not_found" }, { status: 404 });
  }

  // Build the Merkle tree and extract the proof for this specific code.
  // buildCodeTree uses the same double-keccak256 leaf hashing + sorted-pair
  // internal node construction as the on-chain verify logic (D-046..D-048).
  // It returns proofs as Record<string, Uint8Array[]> keyed by code string.
  const { proofs } = buildCodeTree(codes);
  const proof = proofs[code];
  if (!proof) {
    // Should not happen if codes.includes(code) — defensive guard.
    return NextResponse.json({ error: "proof_unavailable" }, { status: 500 });
  }

  // Encode proof nodes as base64 for JSON transport.
  const proofB64 = proof.map((node) => Buffer.from(node).toString("base64"));

  return NextResponse.json({ proof: proofB64 });
}

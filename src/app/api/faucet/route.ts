import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getRedis } from "@/lib/kv/redis";
import { isRateLimited } from "@/lib/kv/ratelimit";

// Run on the Node runtime (not Edge) — Upstash & web3.js need Node APIs.
// Dynamic + short maxDuration: each request is fast and never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_CODES = new Set(
  (process.env.INVITE_CODES ?? "").split(",").filter(Boolean),
);
const FAUCET_SOL = Number(process.env.FAUCET_SOL ?? "1000");
// Server-side RPC URL (not the NEXT_PUBLIC_ one, to avoid leaking in client bundle)
const RPC_URL =
  process.env.VALIDATOR_RPC_URL ??
  process.env.NEXT_PUBLIC_VALIDATOR_RPC ??
  "";

// Upstash Redis for durable used-code tracking (survives redeploys).
// Falls back to in-process Map if env vars aren't set — fine for local dev,
// not for production (resets on each cold start, useless under multi-region).
const memUsed = new Set<string>();

/** Two-stage claim:
 *
 *   1. `reserveCode` — atomic `SET NX EX 60` with a "pending" marker.
 *      Returns false if another request already holds the code OR the code
 *      was permanently claimed. Crash between this and finalize lets the
 *      TTL expire after 60s so the code becomes claimable again.
 *
 *   2. `finalizeUsed` — long-TTL overwrite once the SOL transfer confirmed.
 *
 *   3. `releaseReservation` — undo a still-pending reservation when the
 *      transfer fails BEFORE confirmation. Safe: we only delete keys whose
 *      value matches our "pending:" marker so we never wipe a finalized
 *      claim.
 */
const RESERVATION_TTL_SEC = 60;
const CLAIM_TTL_SEC = 365 * 24 * 3600;
const PENDING_PREFIX = "pending:";

async function reserveCode(code: string, wallet: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (memUsed.has(code)) return false;
    memUsed.add(code);
    return true;
  }
  const res = await redis.set(
    `tombola:faucet:used:${code}`,
    `${PENDING_PREFIX}${wallet}`,
    { nx: true, ex: RESERVATION_TTL_SEC },
  );
  return res !== null;
}

async function finalizeUsed(code: string, wallet: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // memUsed already contains the code from reserveCode
  await redis.set(`tombola:faucet:used:${code}`, wallet, { ex: CLAIM_TTL_SEC });
}

async function releaseReservation(code: string, wallet: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memUsed.delete(code);
    return;
  }
  // Only delete if the value is still our pending marker; protects against
  // a concurrent finalize that races with this rollback.
  const cur = await redis.get<string>(`tombola:faucet:used:${code}`);
  if (cur === `${PENDING_PREFIX}${wallet}`) {
    await redis.del(`tombola:faucet:used:${code}`);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code, wallet } = body as { code?: string; wallet?: string };

  if (!code || !wallet) {
    return NextResponse.json({ error: "code and wallet required" }, { status: 400 });
  }

  // IP-keyed rate-limit. Code uniqueness is permanent (per code, lifetime),
  // but a single IP could try hundreds of bad codes in a loop without it.
  // Vercel forwards the client IP in x-forwarded-for; fall back to a literal
  // "unknown" so the limiter still buckets garbage requests.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (await isRateLimited("faucet", ip)) {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  // INVITE_CODES being empty = open faucet (no codes needed). Set the var to
  // lock it down.
  if (VALID_CODES.size > 0 && !VALID_CODES.has(code.toUpperCase())) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
  }

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  let treasury: Keypair;
  try {
    const raw = JSON.parse(process.env.TREASURY_KEYPAIR ?? "[]");
    treasury = Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch {
    console.error("TREASURY_KEYPAIR env var is missing or malformed");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!RPC_URL) {
    console.error("VALIDATOR_RPC_URL env var is missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Atomic reserve. If reserveCode returns false the code is either
  // permanently claimed OR another in-flight request is claiming it. Either
  // way the right answer is 409.
  const upperCode = code.toUpperCase();
  const reserved = await reserveCode(upperCode, wallet);
  if (!reserved) {
    return NextResponse.json(
      { error: "Invite code already claimed" },
      { status: 409 },
    );
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: recipient,
        lamports: Math.floor(FAUCET_SOL * LAMPORTS_PER_SOL),
      }),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [treasury], {
      commitment: "confirmed",
    });
    // Promote the short-TTL reservation to a permanent claim now that the
    // transfer is confirmed on-chain.
    await finalizeUsed(upperCode, wallet);
    return NextResponse.json({ success: true, signature: sig, sol: FAUCET_SOL });
  } catch (err) {
    await releaseReservation(upperCode, wallet);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("faucet transfer failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

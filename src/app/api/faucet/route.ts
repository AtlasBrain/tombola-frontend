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

async function isUsed(code: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) return !!(await redis.get(`tombola:faucet:used:${code}`));
  return memUsed.has(code);
}
async function markUsed(code: string, wallet: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(`tombola:faucet:used:${code}`, wallet, {
      ex: 365 * 24 * 3600,
    });
  } else {
    memUsed.add(code);
  }
}
async function unmarkUsed(code: string): Promise<void> {
  const redis = getRedis();
  if (redis) await redis.del(`tombola:faucet:used:${code}`);
  else memUsed.delete(code);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code, wallet } = body as { code?: string; wallet?: string };

  if (!code || !wallet) {
    return NextResponse.json({ error: "code and wallet required" }, { status: 400 });
  }

  // INVITE_CODES being empty = open faucet (no codes needed). Set the var to
  // lock it down.
  if (VALID_CODES.size > 0 && !VALID_CODES.has(code.toUpperCase())) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
  }

  if (await isUsed(code.toUpperCase())) {
    return NextResponse.json(
      { error: "Invite code already claimed" },
      { status: 409 },
    );
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

  // Mark before sending to prevent concurrent double-claims
  await markUsed(code.toUpperCase(), wallet);

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
    return NextResponse.json({ success: true, signature: sig, sol: FAUCET_SOL });
  } catch (err) {
    await unmarkUsed(code.toUpperCase());
    const msg = err instanceof Error ? err.message : String(err);
    console.error("faucet transfer failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

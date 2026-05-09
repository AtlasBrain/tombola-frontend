// Devnet pool init with **test-friendly** durations.
//
// Variant of init_pools_local.mts that targets devnet. Same script body
// (the RPC URL is already env-driven) — this file exists so the npm
// script `init:devnet` can call it explicitly and the cluster intent is
// readable from the filename.
//
// Pool durations (same as localnet — short Weekly so the countdown UI
// ticks visibly):
//
//   Weekly      → close in 10 minutes
//   Biweekly    → close in 14 days
//   Triweekly   → close in 21 days
//   Monthly     → close in 30 days
//
// Run from the frontend repo root:
//   NEXT_PUBLIC_SOLANA_RPC_URL='https://devnet.helius-rpc.com/?api-key=...' \
//     npm run init:devnet
//
// Requires: program deployed to devnet (`solana program deploy ...` from
// the companion repo), payer keypair (~/.config/solana/id.json by default)
// funded with ≥ 0.05 SOL on devnet for the 4 pool inits.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

// Dev scripts hit the companion repo's SDK source directly. The frontend's
// vendor/sdk snapshot exists for Vercel — but tsx (unlike Next/webpack)
// doesn't apply the `.js → .ts` extension alias, so the snapshot's internal
// imports break here. The companion repo has its own node_modules and the
// original `.ts` source resolves cleanly when imported by absolute path.
import {
  PoolType,
  RaffleClient,
  type PoolTypeValue,
} from "/Users/marwanchahboun/Desktop/Project Tombola/sdk/src/index.ts";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const KP_PATH = process.env.RAFFLE_KEYPAIR ??
  resolve(homedir(), ".config", "solana", "id.json");

const NOW = BigInt(Math.floor(Date.now() / 1000));
const MINUTE = 60n;
const DAY = 86_400n;

// Test durations — keep Weekly short so its countdown ticks visibly.
const DURATIONS: Record<PoolTypeValue, bigint> = {
  [PoolType.Weekly]: 10n * MINUTE,
  [PoolType.Biweekly]: 14n * DAY,
  [PoolType.Triweekly]: 21n * DAY,
  [PoolType.Monthly]: 30n * DAY,
};

const NAMES: Record<PoolTypeValue, string> = {
  [PoolType.Weekly]: "Weekly",
  [PoolType.Biweekly]: "Biweekly",
  [PoolType.Triweekly]: "Triweekly",
  [PoolType.Monthly]: "Monthly",
};

const arr = Uint8Array.from(JSON.parse(readFileSync(KP_PATH, "utf-8")));
const payer = await createKeyPairSignerFromBytes(arr);
const rpc = createSolanaRpc(RPC_URL);
const client = new RaffleClient({ rpc });

console.log(`init: cluster=${RPC_URL} payer=${payer.address}`);

async function pollSig(sig: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await rpc.getSignatureStatuses([sig as never]).send();
    const s = value[0];
    if (s) {
      if (s.err) throw new Error(`tx error: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`tx ${sig} not confirmed after ${timeoutMs}ms`);
}

for (const poolType of [
  PoolType.Weekly,
  PoolType.Biweekly,
  PoolType.Triweekly,
  PoolType.Monthly,
] as const) {
  // Skip if already initialized (idempotent re-runs after partial failures).
  try {
    await client.getPoolTypeCounter(poolType);
    console.log(`${NAMES[poolType]}: counter exists, skipping`);
    continue;
  } catch {
    // not yet initialized — fall through
  }

  const firstCloseTime = NOW + DURATIONS[poolType];
  const ix = await client.initializePublicPool({
    payer,
    poolType,
    firstCloseTime,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(ix, m),
  );
  const signed = await signTransactionMessageWithSigners(txMessage);
  const sig = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);

  await rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: false }).send();
  await pollSig(sig);

  const closeIso = new Date(Number(firstCloseTime) * 1000).toISOString();
  const [pool] = await client.publicPoolPda(poolType, 1n);
  console.log(`${NAMES[poolType]}: pool=${pool} closes=${closeIso}`);
}

console.log("init: all four public pools opened with test durations.");

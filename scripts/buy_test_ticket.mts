// Localnet buy-ticket smoke test.
//
// Wallet localhost support is broken in 2026 (Phantom + Solflare both dropped
// custom RPC). To verify the SDK ↔ frontend integration end-to-end without
// the wallet popup loop, this script signs with the local Solana keypair at
// ~/.config/solana/id.json and sends a buy_ticket_public tx straight to
// the local validator.
//
// Run:
//   npx tsx scripts/buy_test_ticket.ts                    # buys 1 Weekly ticket
//   npx tsx scripts/buy_test_ticket.ts --pool=2 --qty=3   # 3 Triweekly tickets
//
// After it lands, refresh http://localhost:<dev-port> and the affected
// pool card will show the bumped Tickets / POT values.

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

// Dev scripts hit the companion repo's SDK source directly — see
// init_pools_local.mts header for why the @tombola/sdk alias doesn't work
// from tsx.
import {
  PoolType,
  RaffleClient,
  type PoolTypeValue,
} from "/Users/marwanchahboun/Desktop/Project Tombola/sdk/src/index.ts";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "http://127.0.0.1:8899";

function pickArg(name: string, fallback: number): number {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  return hit ? Number(hit.slice(flag.length)) : fallback;
}

const poolType = pickArg("pool", 0) as PoolTypeValue;
const qty = BigInt(pickArg("qty", 1));

const KP_PATH = process.env.RAFFLE_KEYPAIR ??
  resolve(homedir(), ".config", "solana", "id.json");

const arr = Uint8Array.from(JSON.parse(readFileSync(KP_PATH, "utf-8")));
const buyer = await createKeyPairSignerFromBytes(arr);

const rpc = createSolanaRpc(RPC_URL);
const client = new RaffleClient({ rpc });

const counter = await client.getPoolTypeCounter(poolType);
const round = counter.currentRound;

const before = await client.getPublicPool(poolType, round);
console.log(
  `pool=${PoolType[poolType]} round=${round} ` +
    `before: tickets=${before.totalTickets} pot=${before.totalPot}`,
);

const { instruction } = await client.buyTicketPublic({
  buyer,
  poolType,
  round,
  quantity: qty,
});

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const txMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(buyer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) => appendTransactionMessageInstruction(instruction, m),
);
const signed = await signTransactionMessageWithSigners(txMessage);
const sig = getSignatureFromTransaction(signed);
const wire = getBase64EncodedWireTransaction(signed);

await rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: false }).send();
console.log(`tx sent: ${sig}`);

// Poll signature status until confirmed (no WS — local validator's WS is flaky).
const start = Date.now();
let confirmed = false;
while (Date.now() - start < 30_000) {
  const { value } = await rpc.getSignatureStatuses([sig]).send();
  const s = value[0];
  if (s) {
    if (s.err) throw new Error(`tx error: ${JSON.stringify(s.err)}`);
    if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") {
      confirmed = true;
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!confirmed) throw new Error(`tx ${sig} not confirmed after 30s`);

const after = await client.getPublicPool(poolType, round);
console.log(
  `pool=${PoolType[poolType]} round=${round} ` +
    `after:  tickets=${after.totalTickets} pot=${after.totalPot}`,
);
console.log(
  `\nbought ${qty} ticket(s). Refresh the dapp to see the updated card.`,
);

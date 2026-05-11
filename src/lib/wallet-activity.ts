// 14-week buy-activity histogram for a wallet's profile sparkbar.
//
// Inputs:  RPC URL, program ID, wallet pubkey, nowSec (for stable binning).
// Outputs: an array of 14 numbers — buys per week, oldest to newest.
//
// Algorithm:
//   1. memcmp-scan TicketBatch accounts where owner == wallet  (1 RPC)
//   2. For each batch PDA, getSignaturesForAddress to learn the buy tx's
//      blockTime — Promise.all'd so the wall-clock cost is one RPC roundtrip.
//   3. Bucket each blockTime into one of 14 weekly bins ending at `nowSec`.
//
// Buy-count per week, not ticket-count — a single tx that bought 50 tickets
// is one bar, not fifty. That matches the GitHub-contributions feel of the
// sparkbar in the mockup.

import {
  type Address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchBuySignatures } from "./fetch-buy-signatures";
import { encodeBase58 } from "./base58";
import { fetchTicketBatches } from "./solana/program-queries";

const WEEK_SEC = 7 * 24 * 60 * 60;

export interface WeeklyActivity {
  /** 14 buckets, oldest first. Each value is buy count (not tickets). */
  weeks: number[];
  /** Sum of buys in the last 7 days. */
  last7d: number;
}

export async function fetchWalletActivity(args: {
  rpcUrl: string;
  programId: string;
  wallet: string;
  /** Unix seconds. Caller provides so SSR / hydration stay deterministic. */
  nowSec?: number;
}): Promise<WeeklyActivity> {
  const { rpcUrl, programId, wallet } = args;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);
  const empty: WeeklyActivity = {
    weeks: Array(14).fill(0),
    last7d: 0,
  };

  const rpc = createSolanaRpc(rpcUrl);

  // 1. Find every TicketBatch the wallet owns.
  const walletBytes = new Uint8Array(
    getAddressEncoder().encode(wallet as Address),
  );
  const walletBase58 = encodeBase58(walletBytes);
  const batchAccounts = await fetchTicketBatches({
    rpc,
    programId,
    owner: walletBase58,
  });
  if (batchAccounts.length === 0) return empty;

  // 2. Each batch -> the buy tx that created it. Reuses the same helper
  //    the RecentBuysTable uses (web3.js Connection-backed) so we don't
  //    duplicate the signature-fetch logic across libs.
  const connection = new Connection(rpcUrl, "confirmed");
  // PublicKey constructor validates base58 — cheap shape check.
  const batchPdas = batchAccounts.map((a) => {
    new PublicKey(String(a.pubkey));
    return String(a.pubkey);
  });
  const sigsMap = await fetchBuySignatures(connection, batchPdas);

  // 3. Bin each blockTime into one of 14 weekly buckets ending at nowSec.
  //    Bucket 0 = oldest week (98–91 days ago), bucket 13 = current week
  //    (last 7 days). Anything older than 98 days is dropped.
  const weeks = Array(14).fill(0) as number[];
  let last7d = 0;
  for (const sig of sigsMap.values()) {
    if (sig.blockTime === null) continue;
    const ageSec = nowSec - sig.blockTime;
    if (ageSec < 0 || ageSec >= 14 * WEEK_SEC) continue;
    // 13 - floor(age / week) → newest bucket is 13.
    const weeksAgo = Math.floor(ageSec / WEEK_SEC);
    const idx = 13 - weeksAgo;
    weeks[idx] += 1;
    if (ageSec < WEEK_SEC) last7d += 1;
  }

  return { weeks, last7d };
}

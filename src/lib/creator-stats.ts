// Per-creator reputation stats. Powers /creator/[address].
//
// All numbers come from on-chain state — no off-chain database. We scan
// every PrivatePool account, filter by `creator == address`, decode each,
// and aggregate. Same memcmp pattern as findMyPrivatePools but exposed as
// a typed result object the profile page can render directly.

import {
  type Address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";
import { generated } from "@tombola/sdk";
import { encodeBase58 } from "./base58";
import { unwrapOption } from "./codec/option";
import { decodeAccountBytes, fetchPrivatePools } from "./solana/program-queries";

export interface CreatorPoolSummary {
  poolAddress: string;
  state: 0 | 1 | 2;
  totalTickets: bigint;
  totalPotLamports: bigint;
  ticketPriceLamports: bigint;
  closeTimeUnix: number;
  openTimeUnix: number;
  creatorFeeBps: number;
  feeEarnedLamports: bigint;
  /** True only if state == Resolved AND a winner was set. */
  paidOut: boolean;
  /** Resolved pools that didn't pay out (winner = None) — the protocol
   *  uses this for zero-ticket pools and stuck rounds that retried-out. */
  voided: boolean;
  accessMode: "Whitelist" | "OneCodePerTicket";
}

export interface CreatorStats {
  address: string;
  poolsCount: number;
  resolvedCount: number;
  liveCount: number;
  /** Pools where settle landed AND winner was set. */
  paidOutCount: number;
  /** Sum of fee earnings from RESOLVED pools only (the only pools where
   *  the creator has been paid). Pending fees are computed separately. */
  feesEarnedLamports: bigint;
  /** Pending fees from non-resolved pools (creator hasn't been paid yet). */
  feesPendingLamports: bigint;
  /** % of resolved pools that paid out. 100% means a clean reputation. */
  payoutRate: number;
  totalTicketsSold: bigint;
  totalPotLamports: bigint;
  /** unix sec of the most recent pool's open time, or null if no pools. */
  lastPoolOpenedAt: number | null;
  pools: CreatorPoolSummary[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accessModeLabel(am: any): "Whitelist" | "OneCodePerTicket" {
  if (typeof am === "number") {
    return am === 0 ? "Whitelist" : "OneCodePerTicket";
  }
  if (am && typeof am === "object" && "__kind" in am) {
    return am.__kind === "WhitelistMode" ? "Whitelist" : "OneCodePerTicket";
  }
  return "Whitelist";
}

export async function fetchCreatorStats(args: {
  rpcUrl: string;
  programId: string;
  creatorAddress: string;
}): Promise<CreatorStats> {
  const rpc = createSolanaRpc(args.rpcUrl);
  const creatorBytes = new Uint8Array(
    getAddressEncoder().encode(args.creatorAddress as Address),
  );
  const creatorBase58 = encodeBase58(creatorBytes);

  // Scan PrivatePool accounts where creator field == this address.
  const result = await fetchPrivatePools({
    rpc,
    programId: args.programId,
    creator: creatorBase58,
  });

  const decoder = generated.getPrivatePoolDecoder();
  const pools: CreatorPoolSummary[] = [];
  for (const acc of result) {
    try {
      const bytes = decodeAccountBytes(acc);
      const p = decoder.decode(bytes);
      const fee =
        (p.totalPot * BigInt(p.creatorFeeBps)) / 10_000n;
      const winner = unwrapOption(p.winner, String);
      const isResolved = Number(p.state) === 2;
      pools.push({
        poolAddress: String(acc.pubkey),
        state: Number(p.state) as 0 | 1 | 2,
        totalTickets: p.totalTickets,
        totalPotLamports: p.totalPot,
        ticketPriceLamports: p.ticketPrice,
        closeTimeUnix: Number(p.closeTime),
        openTimeUnix: Number(p.openTime),
        creatorFeeBps: p.creatorFeeBps,
        feeEarnedLamports: fee,
        paidOut: isResolved && winner !== null,
        voided: isResolved && winner === null,
        accessMode: accessModeLabel(p.accessMode),
      });
    } catch {
      // skip undecodable
    }
  }

  // Sort newest pool first
  pools.sort((a, b) => b.openTimeUnix - a.openTimeUnix);

  let resolvedCount = 0;
  let paidOutCount = 0;
  let liveCount = 0;
  let feesEarned = 0n;
  let feesPending = 0n;
  let totalTicketsSold = 0n;
  let totalPotLamports = 0n;
  for (const p of pools) {
    totalTicketsSold += p.totalTickets;
    totalPotLamports += p.totalPotLamports;
    if (p.state === 2) {
      resolvedCount += 1;
      if (p.paidOut) {
        paidOutCount += 1;
        feesEarned += p.feeEarnedLamports;
      }
    } else {
      liveCount += 1;
      feesPending += p.feeEarnedLamports;
    }
  }

  const payoutRate = resolvedCount > 0 ? (paidOutCount / resolvedCount) * 100 : 0;

  return {
    address: args.creatorAddress,
    poolsCount: pools.length,
    resolvedCount,
    liveCount,
    paidOutCount,
    feesEarnedLamports: feesEarned,
    feesPendingLamports: feesPending,
    payoutRate,
    totalTicketsSold,
    totalPotLamports,
    lastPoolOpenedAt: pools.length > 0 ? pools[0].openTimeUnix : null,
    pools,
  };
}

// Discover every pool a wallet has bought tickets in.
//
// Strategy: a single getProgramAccounts(dataSize=89, memcmp=owner) returns
// every TicketBatch the wallet ever created. Group by `pool` field and we
// know the full set of pools the user touched. Then per-pool we fetch the
// pool account + every batch in it (for participant counts).

import {
  type Address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";
import { generated } from "@tombola/sdk";
import { encodeBase58 } from "./base58";
import { unwrapOption } from "./codec/option";

import {
  PRIVATE_POOL_SIZE_N as PRIVATE_POOL_SIZE,
  PUBLIC_POOL_SIZE_N as PUBLIC_POOL_SIZE,
  TICKET_BATCH_OWNER_OFFSET,
  TICKET_BATCH_POOL_OFFSET,
  TICKET_BATCH_SIZE,
} from "./constants";

const POOL_OFFSET = BigInt(TICKET_BATCH_POOL_OFFSET);
const OWNER_OFFSET = BigInt(TICKET_BATCH_OWNER_OFFSET);

export type PoolKindForBuyer = "public" | "private";

export type PoolStateLabel = "Open" | "AwaitingVrf" | "Resolved";

export interface MyBatch {
  /** TicketBatch PDA. */
  batchAddress: string;
  poolAddress: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
  quantity: bigint;
}

export interface PoolMembership {
  poolAddress: string;
  kind: PoolKindForBuyer;
  /** Public pools have a numeric type slug + round; private pools don't. */
  publicPoolType?: number;
  publicRound?: bigint;
  state: PoolStateLabel;
  closeTimeUnix: number;
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  /** null pre-settle. */
  winner: string | null;
  /** null pre-settle. */
  winningTicketId: bigint | null;
  /** Distinct participant count. Filled in async; null while loading. */
  participantsCount: number | null;
  /** All TicketBatches owned by THIS wallet in this pool, summed. */
  myTickets: bigint;
  mySpentLamports: bigint;
  /** True if this wallet won. False on resolved-and-someone-else-won OR pre-settle. */
  iWon: boolean;
}

const PRIVATE_POOL_DECODER = generated.getPrivatePoolDecoder();
const PUBLIC_POOL_DECODER = generated.getPublicPoolDecoder();
const TICKET_BATCH_DECODER = generated.getTicketBatchDecoder();

/**
 * Returns the full list of pools a wallet has bought tickets in. Sorted by
 * close_time DESC (most recent activity first). The participantsCount field
 * is null on initial render and filled in by the caller via a follow-up
 * fetchParticipantsForPools() pass — keeps the first paint fast.
 */
export async function findMyParticipations(args: {
  rpcUrl: string;
  programId: string;
  walletAddress: string;
}): Promise<PoolMembership[]> {
  const rpc = createSolanaRpc(args.rpcUrl);
  const ownerBytes = new Uint8Array(
    getAddressEncoder().encode(args.walletAddress as Address),
  );
  const ownerBase58 = encodeBase58(ownerBytes);

  // Step 1: my batches across every pool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batches = (await (rpc.getProgramAccounts as any)(
    args.programId as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        { dataSize: TICKET_BATCH_SIZE },
        { memcmp: { offset: OWNER_OFFSET, bytes: ownerBase58 } },
      ],
    },
  ).send()) as ReadonlyArray<{
    pubkey: Address;
    account: { data: readonly [string, "base64"] };
  }>;

  if (batches.length === 0) return [];

  // Decode each batch + group by pool
  const myBatchesByPool = new Map<string, MyBatch[]>();
  for (const acc of batches) {
    const [b64] = acc.account.data;
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    const b = TICKET_BATCH_DECODER.decode(bytes);
    const poolAddress = String(b.pool);
    const quantity = b.lastTicketId - b.firstTicketId + 1n;
    const myBatch: MyBatch = {
      batchAddress: String(acc.pubkey),
      poolAddress,
      firstTicketId: b.firstTicketId,
      lastTicketId: b.lastTicketId,
      quantity,
    };
    const arr = myBatchesByPool.get(poolAddress);
    if (arr) arr.push(myBatch);
    else myBatchesByPool.set(poolAddress, [myBatch]);
  }

  // Step 2: per-pool fetch. Parallel — each pool is independent.
  const memberships = await Promise.all(
    [...myBatchesByPool.entries()].map(async ([poolAddress, myBatches]) => {
      try {
        const info = await rpc
          .getAccountInfo(poolAddress as Address, { encoding: "base64" })
          .send();
        const value = info.value;
        if (!value) return null;
        const data = Uint8Array.from(
          Buffer.from((value.data as readonly [string, "base64"])[0], "base64"),
        );
        return decodePoolMembership(
          poolAddress,
          data,
          myBatches,
          args.walletAddress,
        );
      } catch {
        return null;
      }
    }),
  );

  return memberships
    .filter((m): m is PoolMembership => m !== null)
    .sort((a, b) => b.closeTimeUnix - a.closeTimeUnix);
}

/**
 * Second pass: fill in participantsCount per pool. Sequential to be gentle
 * on RPC. Caller updates UI per result.
 */
export async function* iterateParticipantCounts(args: {
  rpcUrl: string;
  programId: string;
  poolAddresses: string[];
}): AsyncGenerator<{ poolAddress: string; count: number }, void, unknown> {
  const rpc = createSolanaRpc(args.rpcUrl);
  for (const poolAddress of args.poolAddresses) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await (rpc.getProgramAccounts as any)(
        args.programId as Address,
        {
          commitment: "confirmed",
          encoding: "base64",
          filters: [
            { dataSize: TICKET_BATCH_SIZE },
            { memcmp: { offset: POOL_OFFSET, bytes: poolAddress as Address } },
          ],
        },
      ).send()) as ReadonlyArray<{
        pubkey: Address;
        account: { data: readonly [string, "base64"] };
      }>;
      const owners = new Set<string>();
      for (const acc of result) {
        const [b64] = acc.account.data;
        const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
        owners.add(String(TICKET_BATCH_DECODER.decode(bytes).owner));
      }
      yield { poolAddress, count: owners.size };
    } catch {
      yield { poolAddress, count: 0 };
    }
  }
}

// ------------ internals ----------------

function decodePoolMembership(
  poolAddress: string,
  data: Uint8Array,
  myBatches: MyBatch[],
  myAddress: string,
): PoolMembership | null {
  const myTickets = myBatches.reduce((acc, b) => acc + b.quantity, 0n);

  if (data.length === PUBLIC_POOL_SIZE) {
    const p = PUBLIC_POOL_DECODER.decode(data);
    const winner = unwrapOption(p.winner, String);
    const winningTicketId = unwrapOption(p.winningTicket, (v) =>
      BigInt(v as bigint | number | string),
    );
    return {
      poolAddress,
      kind: "public",
      publicPoolType: Number(p.poolType),
      publicRound: BigInt(p.roundNumber),
      state: STATE_LABEL[Number(p.state) as 0 | 1 | 2],
      closeTimeUnix: Number(p.closeTime),
      ticketPriceLamports: p.ticketPrice,
      totalTickets: p.totalTickets,
      totalPotLamports: p.totalPot,
      winner,
      winningTicketId,
      participantsCount: null,
      myTickets,
      mySpentLamports: myTickets * p.ticketPrice,
      iWon: winner === myAddress,
    };
  }

  if (data.length === PRIVATE_POOL_SIZE) {
    const p = PRIVATE_POOL_DECODER.decode(data);
    const winner = unwrapOption(p.winner, String);
    const winningTicketId = unwrapOption(p.winningTicket, (v) =>
      BigInt(v as bigint | number | string),
    );
    return {
      poolAddress,
      kind: "private",
      state: STATE_LABEL[Number(p.state) as 0 | 1 | 2],
      closeTimeUnix: Number(p.closeTime),
      ticketPriceLamports: p.ticketPrice,
      totalTickets: p.totalTickets,
      totalPotLamports: p.totalPot,
      winner,
      winningTicketId,
      participantsCount: null,
      myTickets,
      mySpentLamports: myTickets * p.ticketPrice,
      iWon: winner === myAddress,
    };
  }

  // Unknown account size — skip.
  return null;
}

const STATE_LABEL: Record<0 | 1 | 2, PoolStateLabel> = {
  0: "Open",
  1: "AwaitingVrf",
  2: "Resolved",
};

// ------------ pure aggregations (testable) ----------------

export interface BuyerLifetimeStats {
  poolsCount: number;
  livePoolsCount: number;
  resolvedCount: number;
  wonCount: number;
  totalTickets: bigint;
  totalSpentLamports: bigint;
  totalWonLamports: bigint;
  /** Won SOL minus spent SOL across resolved pools only. Negative = net loss. */
  netPnLLamports: bigint;
}

export function computeLifetimeStats(
  pools: PoolMembership[],
): BuyerLifetimeStats {
  let totalTickets = 0n;
  let totalSpent = 0n;
  let totalWon = 0n;
  let resolvedSpent = 0n;
  let live = 0;
  let resolved = 0;
  let won = 0;
  for (const p of pools) {
    totalTickets += p.myTickets;
    totalSpent += p.mySpentLamports;
    if (p.state === "Resolved") {
      resolved += 1;
      resolvedSpent += p.mySpentLamports;
      if (p.iWon) {
        won += 1;
        totalWon += p.totalPotLamports;
      }
    } else {
      live += 1;
    }
  }
  return {
    poolsCount: pools.length,
    livePoolsCount: live,
    resolvedCount: resolved,
    wonCount: won,
    totalTickets,
    totalSpentLamports: totalSpent,
    totalWonLamports: totalWon,
    netPnLLamports: totalWon - resolvedSpent,
  };
}

export type BuyerFilter = "all" | "live" | "won" | "lost";

export function filterPools(
  pools: PoolMembership[],
  filter: BuyerFilter,
): PoolMembership[] {
  switch (filter) {
    case "all":
      return pools;
    case "live":
      return pools.filter((p) => p.state !== "Resolved");
    case "won":
      return pools.filter((p) => p.state === "Resolved" && p.iWon);
    case "lost":
      return pools.filter(
        (p) => p.state === "Resolved" && !p.iWon,
      );
  }
}

/** Counts shown next to each filter chip. */
export function filterCounts(
  pools: PoolMembership[],
): Record<BuyerFilter, number> {
  return {
    all: pools.length,
    live: filterPools(pools, "live").length,
    won: filterPools(pools, "won").length,
    lost: filterPools(pools, "lost").length,
  };
}

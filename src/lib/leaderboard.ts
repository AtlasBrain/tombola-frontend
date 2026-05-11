// Public-pool leaderboards. Two ranked lists, both derived purely from
// on-chain state — no server, no off-chain index.
//
//   Top winners: wallets with the most SOL paid out across resolved
//                public-pool rounds. Computed by scanning all PublicPool
//                accounts (state == Resolved) and summing pot won by
//                pool.winner.
//
//   Top buyers:  wallets ranked by total tickets bought across all public
//                pools (open OR resolved). Computed by scanning every
//                TicketBatch (dataSize=89) and aggregating per owner.
//                We exclude private-pool batches by cross-referencing the
//                batch's `pool` field against the set of PublicPool PDAs.
//
// Both calls return at most TOP_N entries (default 10). Devnet has handful
// of accounts so this is cheap; mainnet should cache server-side once
// volume grows.

import { type Address, createSolanaRpc } from "@solana/kit";
import { generated } from "@tombola/sdk";
import { unwrapOption } from "./codec/option";
import { TICKET_BATCH_SIZE } from "./constants";
import { fetchPublicPools } from "./solana/program-queries";

const TOP_N = 10;

export interface WinnerRow {
  address: string;
  totalWonLamports: bigint;
  winsCount: number;
}

export interface BuyerRow {
  address: string;
  totalTickets: bigint;
  totalSpentLamports: bigint;
  poolsParticipatedIn: number;
}

export interface Leaderboard {
  topWinners: WinnerRow[];
  topBuyers: BuyerRow[];
  /** Number of resolved public rounds scanned (for context). */
  resolvedRoundsCount: number;
  /** Total ticket batches scanned. */
  ticketBatchesCount: number;
}

export async function fetchLeaderboard(args: {
  rpcUrl: string;
  programId: string;
}): Promise<Leaderboard> {
  const rpc = createSolanaRpc(args.rpcUrl);

  // Two parallel scans — one for PublicPool accounts (winners), one for
  // TicketBatch accounts (buyers).
  const [poolsResult, batchesResult] = await Promise.allSettled([
    fetchPublicPools({ rpc, programId: args.programId }),
    // All-batches scan — typed helpers in solana/program-queries require a
    // pool or owner filter to avoid accidental wide scans. Leaderboard
    // explicitly wants every batch, so call directly here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rpc.getProgramAccounts as any)(args.programId as Address, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: TICKET_BATCH_SIZE }],
    }).send() as Promise<
      ReadonlyArray<{
        pubkey: Address;
        account: { data: readonly [string, "base64"] };
      }>
    >,
  ]);

  const publicPoolPdas = new Set<string>();
  const winnerTotals = new Map<
    string,
    { lamports: bigint; wins: number }
  >();
  let resolvedRoundsCount = 0;

  if (poolsResult.status === "fulfilled") {
    const decoder = generated.getPublicPoolDecoder();
    for (const acc of poolsResult.value) {
      try {
        const [b64] = acc.account.data;
        const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
        const p = decoder.decode(bytes);
        publicPoolPdas.add(String(acc.pubkey));
        if (Number(p.state) !== 2) continue;
        const winner = unwrapOption(p.winner, String);
        if (!winner) continue;
        resolvedRoundsCount += 1;
        const cur = winnerTotals.get(winner) ?? { lamports: 0n, wins: 0 };
        winnerTotals.set(winner, {
          lamports: cur.lamports + p.totalPot,
          wins: cur.wins + 1,
        });
      } catch {
        // skip
      }
    }
  }

  // Buyer aggregation — scan every TicketBatch but only count those whose
  // `pool` field references a PublicPool we discovered above.
  let ticketBatchesCount = 0;
  const buyerTotals = new Map<
    string,
    { tickets: bigint; spent: bigint; pools: Set<string> }
  >();

  if (batchesResult.status === "fulfilled") {
    const batchDecoder = generated.getTicketBatchDecoder();
    // Need ticket prices per pool to compute "spent" correctly. The pool
    // doesn't decode price for batches we already have. So re-decode pools
    // for their price field.
    const poolPriceByPda = new Map<string, bigint>();
    if (poolsResult.status === "fulfilled") {
      const decoder = generated.getPublicPoolDecoder();
      for (const acc of poolsResult.value) {
        try {
          const [b64] = acc.account.data;
          const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          const p = decoder.decode(bytes);
          poolPriceByPda.set(String(acc.pubkey), p.ticketPrice);
        } catch {
          // skip
        }
      }
    }

    for (const acc of batchesResult.value) {
      ticketBatchesCount += 1;
      try {
        const [b64] = acc.account.data;
        const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
        const b = batchDecoder.decode(bytes);
        const poolPda = String(b.pool);
        if (!publicPoolPdas.has(poolPda)) continue; // skip private-pool batches
        const owner = String(b.owner);
        const qty = b.lastTicketId - b.firstTicketId + 1n;
        const price = poolPriceByPda.get(poolPda) ?? 0n;
        const spent = qty * price;
        const cur = buyerTotals.get(owner) ?? {
          tickets: 0n,
          spent: 0n,
          pools: new Set<string>(),
        };
        cur.tickets += qty;
        cur.spent += spent;
        cur.pools.add(poolPda);
        buyerTotals.set(owner, cur);
      } catch {
        // skip
      }
    }
  }

  const topWinners: WinnerRow[] = [...winnerTotals.entries()]
    .map(([address, v]) => ({
      address,
      totalWonLamports: v.lamports,
      winsCount: v.wins,
    }))
    .sort((a, b) =>
      a.totalWonLamports < b.totalWonLamports
        ? 1
        : a.totalWonLamports > b.totalWonLamports
          ? -1
          : 0,
    )
    .slice(0, TOP_N);

  const topBuyers: BuyerRow[] = [...buyerTotals.entries()]
    .map(([address, v]) => ({
      address,
      totalTickets: v.tickets,
      totalSpentLamports: v.spent,
      poolsParticipatedIn: v.pools.size,
    }))
    .sort((a, b) =>
      a.totalTickets < b.totalTickets
        ? 1
        : a.totalTickets > b.totalTickets
          ? -1
          : 0,
    )
    .slice(0, TOP_N);

  return {
    topWinners,
    topBuyers,
    resolvedRoundsCount,
    ticketBatchesCount,
  };
}

// Per-wallet stats derived purely from on-chain state — no server-side store.
//
// Inputs:  RPC URL, raffle program ID, wallet pubkey.
// Outputs: tickets, pools entered, wins, win rate, lamports spent / won /
//          best, and Net PnL.
//
// Algorithm:
//   1. memcmp-scan TicketBatch accounts where owner == wallet  (1 RPC)
//   2. Group batches by their pool PDA → distinct pool addresses
//   3. Fetch all those pool accounts in one getMultipleAccounts call
//   4. Decode each pool as PublicPool OR PrivatePool by data length
//      (PublicPool = 150 bytes, PrivatePool = 216 bytes)
//   5. Aggregate:
//        - tickets   = sum(batch.qty)
//        - spent     = sum(batch.qty * pool.ticketPrice)
//        - wins      = count(pool.state == Resolved AND pool.winner == wallet)
//        - won       = sum(winner_share for those pools)
//        - bestWin   = max(winner_share)
//        - winRate   = wins / resolvedPools  (where wallet had ≥1 ticket)
//
// winner_share = total_pot - protocol_fee - creator_fee
//   protocol_fee = total_pot * 50 / 10000   (PROTOCOL_FEE_BPS, see constants.rs)
//   creator_fee  = total_pot * pool.creatorFeeBps / 10000   (0 for public pools)
//
// Performance: TicketBatch memcmp is fast even at scale because the RPC
// indexes by memcmp+dataSize. Pool fetches are batched into one
// getMultipleAccounts.

import {
  type Address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";
import { generated } from "@tombola/sdk";
import { encodeBase58 } from "./base58";
import { unwrapOption } from "./codec/option";
import {
  PROTOCOL_FEE_BPS,
  PRIVATE_POOL_SIZE_N as PRIVATE_POOL_SIZE,
  PUBLIC_POOL_SIZE_N as PUBLIC_POOL_SIZE,
  TICKET_BATCH_OWNER_OFFSET as OWNER_OFFSET,
  TICKET_BATCH_SIZE,
} from "./constants";

export interface WalletStats {
  /** Wallet's total tickets across every pool. */
  tickets: bigint;
  /** Distinct pools the wallet has ≥1 ticket in. */
  pools: number;
  /** Lamports spent (sum of qty × ticketPrice). */
  spentLamports: bigint;
  /** Lamports won (winner's share, post-fees). */
  wonLamports: bigint;
  /** Largest single-pool winner's share. */
  bestWinLamports: bigint;
  /** Net = won - spent. Can be negative. */
  netPnLLamports: bigint;
  /** Number of resolved pools where wallet was the winner. */
  wins: number;
  /** Resolved pools where the wallet had ≥1 ticket — the win-rate denominator. */
  resolvedPools: number;
  /** wins / resolvedPools * 100. 0 when resolvedPools == 0. */
  winRatePct: number;
}

const EMPTY: WalletStats = {
  tickets: 0n,
  pools: 0,
  spentLamports: 0n,
  wonLamports: 0n,
  bestWinLamports: 0n,
  netPnLLamports: 0n,
  wins: 0,
  resolvedPools: 0,
  winRatePct: 0,
};

interface MinimalBatch {
  pool: string;
  quantity: bigint;
}

interface MinimalPool {
  pubkey: string;
  /** "public" | "private" — picked from account data length. */
  kind: "public" | "private";
  totalPot: bigint;
  ticketPrice: bigint;
  state: number;
  winner: string | null;
  creatorFeeBps: number;
}

export async function fetchWalletStats(args: {
  rpcUrl: string;
  programId: string;
  wallet: string;
}): Promise<WalletStats> {
  const { rpcUrl, programId, wallet } = args;
  const rpc = createSolanaRpc(rpcUrl);

  // 1. TicketBatch where owner == wallet.
  const walletBytes = new Uint8Array(
    getAddressEncoder().encode(wallet as Address),
  );
  const walletBase58 = encodeBase58(walletBytes);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchAccounts = (await (rpc.getProgramAccounts as any)(
    programId as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        { dataSize: TICKET_BATCH_SIZE },
        { memcmp: { offset: OWNER_OFFSET, bytes: walletBase58 } },
      ],
    },
  ).send()) as ReadonlyArray<{
    pubkey: Address;
    account: { data: readonly [string, "base64"] };
  }>;

  if (batchAccounts.length === 0) return EMPTY;

  const batchDecoder = generated.getTicketBatchDecoder();
  const batches: MinimalBatch[] = [];
  for (const acc of batchAccounts) {
    try {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const b = batchDecoder.decode(bytes);
      batches.push({
        pool: String(b.pool),
        quantity: b.lastTicketId - b.firstTicketId + 1n,
      });
    } catch {
      // Skip undecodable batches.
    }
  }

  // 2. Distinct pool PDAs.
  const poolPdas = Array.from(new Set(batches.map((b) => b.pool)));

  // 3. Fetch all referenced pool accounts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const multi = (await (rpc.getMultipleAccounts as any)(poolPdas, {
    commitment: "confirmed",
    encoding: "base64",
  }).send()) as {
    value: ReadonlyArray<
      null | { data: readonly [string, "base64"] }
    >;
  };

  // 4. Decode each pool as public or private by length.
  const publicDecoder = generated.getPublicPoolDecoder();
  const privateDecoder = generated.getPrivatePoolDecoder();
  const pools = new Map<string, MinimalPool>();

  for (let i = 0; i < poolPdas.length; i++) {
    const pda = poolPdas[i];
    const item = multi.value[i];
    if (!item) continue;
    const [b64] = item.data;
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    try {
      if (bytes.length === PUBLIC_POOL_SIZE) {
        const p = publicDecoder.decode(bytes);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const winner = unwrapOption((p as any).winner, String);
        pools.set(pda, {
          pubkey: pda,
          kind: "public",
          totalPot: p.totalPot,
          ticketPrice: p.ticketPrice,
          state: Number(p.state),
          winner,
          creatorFeeBps: 0, // public pools have no creator fee
        });
      } else if (bytes.length === PRIVATE_POOL_SIZE) {
        const p = privateDecoder.decode(bytes);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const winner = unwrapOption((p as any).winner, String);
        pools.set(pda, {
          pubkey: pda,
          kind: "private",
          totalPot: p.totalPot,
          ticketPrice: p.ticketPrice,
          state: Number(p.state),
          winner,
          creatorFeeBps: p.creatorFeeBps,
        });
      }
    } catch {
      // Skip pools that don't decode.
    }
  }

  // 5. Aggregate.
  let tickets = 0n;
  let spent = 0n;
  let won = 0n;
  let bestWin = 0n;
  let wins = 0;
  let resolvedPools = 0;
  const seenPools = new Set<string>();
  const seenResolvedPools = new Set<string>();

  for (const b of batches) {
    seenPools.add(b.pool);
    tickets += b.quantity;
    const pool = pools.get(b.pool);
    if (!pool) continue;
    spent += b.quantity * pool.ticketPrice;
    if (pool.state === 2 && !seenResolvedPools.has(b.pool)) {
      seenResolvedPools.add(b.pool);
      resolvedPools += 1;
      if (pool.winner === wallet) {
        wins += 1;
        const protocolFee =
          (pool.totalPot * PROTOCOL_FEE_BPS) / 10_000n;
        const creatorFee =
          (pool.totalPot * BigInt(pool.creatorFeeBps)) / 10_000n;
        const share = pool.totalPot - protocolFee - creatorFee;
        won += share;
        if (share > bestWin) bestWin = share;
      }
    }
  }

  const winRatePct =
    resolvedPools > 0 ? (wins / resolvedPools) * 100 : 0;

  return {
    tickets,
    pools: seenPools.size,
    spentLamports: spent,
    wonLamports: won,
    bestWinLamports: bestWin,
    netPnLLamports: won - spent,
    wins,
    resolvedPools,
    winRatePct,
  };
}

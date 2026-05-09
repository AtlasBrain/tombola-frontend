import "server-only";
import { address as toAddress, createSolanaRpc } from "@solana/kit";
import {
  PROGRAM_ID,
  PoolType,
  RaffleClient,
  generated,
  type PoolTypeValue,
} from "@tombola/sdk";
import type { PoolView, PoolKind, PoolState } from "./mock-pools";

const KIND_BY_TYPE: Record<PoolTypeValue, PoolKind> = {
  [PoolType.Weekly]: "Weekly",
  [PoolType.Biweekly]: "Biweekly",
  [PoolType.Triweekly]: "Triweekly",
  [PoolType.Monthly]: "Monthly",
};

const STATE_BY_DISCRIMINANT: Record<number, PoolState> = {
  0: "Open",
  1: "AwaitingVrf",
  2: "Resolved",
};

const KIND_TO_TYPE: Record<string, PoolTypeValue> = {
  weekly: PoolType.Weekly,
  biweekly: PoolType.Biweekly,
  triweekly: PoolType.Triweekly,
  monthly: PoolType.Monthly,
};

export function poolTypeFromSlug(slug: string): PoolTypeValue | null {
  const value = KIND_TO_TYPE[slug.toLowerCase()];
  return value ?? null;
}

export interface TicketBatchView {
  /** PDA of the TicketBatch account itself. */
  batchAddress: string;
  /** Buyer's wallet address (base58). */
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
  quantity: bigint;
  spentLamports: bigint;
}

export interface PoolDetail {
  pool: PoolView;
  batches: TicketBatchView[];
  /** Resolved-state metadata. Both fields are null until settle lands. */
  winner: string | null;
  winningTicketId: bigint | null;
}

// TicketBatch on-chain layout: discriminator(8) + pool(32) + owner(32) + ...
// The `pool` field at offset 8 is what we filter on for "all batches in pool X".
const TICKET_BATCH_SIZE = 89n;
const POOL_OFFSET = 8n;

/**
 * Fetch a pool + all its TicketBatch accounts, sorted by ticket-id ascending.
 *
 * Returns null if the pool doesn't exist (e.g. the user typed a /pool URL
 * for a poolType + round that was never initialized).
 */
export async function getPoolDetail(
  poolType: PoolTypeValue,
  round: bigint,
): Promise<PoolDetail | null> {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");
  const rpc = createSolanaRpc(url);
  const client = new RaffleClient({ rpc });

  let p: Awaited<ReturnType<typeof client.getPublicPool>>;
  try {
    p = await client.getPublicPool(poolType, round);
  } catch {
    return null; // pool account missing
  }

  const [poolAddress] = await client.publicPoolPda(poolType, round);

  const pool: PoolView = {
    kind: KIND_BY_TYPE[poolType],
    poolType,
    round,
    state: STATE_BY_DISCRIMINANT[Number(p.state)] ?? "Open",
    totalTickets: p.totalTickets,
    totalPotLamports: p.totalPot,
    closeTimeUnix: Number(p.closeTime),
    ticketPriceLamports: p.ticketPrice,
    poolAddress: String(poolAddress),
  };

  // Fetch all TicketBatches whose `pool` field matches this pool's PDA.
  // Cast through `unknown` because Kit's `getProgramAccounts` return type
  // varies by overload (with/without `withContext`); we know our call shape
  // returns the bare array.
  const accounts = (await rpc
    .getProgramAccounts(toAddress(PROGRAM_ID), {
      encoding: "base64",
      filters: [
        { dataSize: TICKET_BATCH_SIZE },
        {
          memcmp: {
            offset: POOL_OFFSET,
            bytes: String(poolAddress) as never,
            encoding: "base58",
          },
        },
      ],
    })
    .send()) as unknown as readonly {
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }[];

  const decoder = generated.getTicketBatchDecoder();
  const batches: TicketBatchView[] = accounts
    .map((acc) => {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const batch = decoder.decode(bytes);
      const quantity = batch.lastTicketId - batch.firstTicketId + 1n;
      return {
        batchAddress: String(acc.pubkey),
        owner: String(batch.owner),
        firstTicketId: batch.firstTicketId,
        lastTicketId: batch.lastTicketId,
        quantity,
        spentLamports: quantity * pool.ticketPriceLamports,
      };
    })
    .sort((a, b) =>
      a.firstTicketId < b.firstTicketId
        ? -1
        : a.firstTicketId > b.firstTicketId
          ? 1
          : 0,
    );

  // Codama Option<T> decodes as { __option: 'Some'|'None', value? }. Some
  // SDK paths return raw values; handle both. Null = pre-settle.
  const winner = unwrapOption<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p as any).winner,
    String,
  );
  const winningTicketId = unwrapOption<bigint>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p as any).winningTicket,
    (v) => BigInt(v as bigint | number | string),
  );

  return { pool, batches, winner, winningTicketId };
}

function unwrapOption<T>(
  raw: unknown,
  coerce: (v: unknown) => T,
): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && raw !== null && "__option" in raw) {
    const opt = raw as { __option: "Some" | "None"; value?: unknown };
    return opt.__option === "Some" && opt.value !== undefined
      ? coerce(opt.value)
      : null;
  }
  return coerce(raw);
}

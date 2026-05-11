// Typed wrappers around `getProgramAccounts` for the raffle program's
// three account shapes (TicketBatch, PublicPool, PrivatePool).
//
// `@solana/kit`'s RPC types are *very* generic — calling
// `rpc.getProgramAccounts(...)` directly in callsite code forced every
// stats lib and component to cast through `as any`, hide a hand-rolled
// `RpcAny` shim, or both. This module owns the cast once and exposes
// strongly-typed return arrays.
//
// Each wrapper:
//   1. Builds the right filters (dataSize + optional memcmp byte).
//   2. Sends the RPC call with `commitment: "confirmed"` and base64
//      encoding (matches existing call-site behavior).
//   3. Returns a Promise<readonly RawAccount[]> — the raw base64 payload
//      and the pubkey. Decoding stays in the calling module so the
//      decoder choice (TicketBatch vs PrivatePool vs PublicPool) is
//      explicit there.

import type { Address } from "@solana/kit";
import bs58 from "bs58";
import {
  PRIVATE_POOL_SIZE,
  PRIVATE_POOL_STATE_OFFSET,
  PUBLIC_POOL_SIZE,
  TICKET_BATCH_OWNER_OFFSET,
  TICKET_BATCH_POOL_OFFSET,
  TICKET_BATCH_SIZE,
} from "../constants";

/** Account record as returned by getProgramAccounts(encoding: "base64"). */
export interface RawAccount {
  pubkey: string;
  account: { data: readonly [string, "base64"] };
}

// Kit's RPC return type is heavily generic. We narrow at one place here
// rather than spread `as any` throughout the codebase.
type RpcLike = {
  getProgramAccounts: (
    programId: Address,
    config: unknown,
  ) => { send: () => Promise<unknown> };
};

async function rawAccountsCall(
  rpc: unknown,
  programId: string,
  config: Record<string, unknown>,
): Promise<readonly RawAccount[]> {
  const accounts = await (rpc as RpcLike).getProgramAccounts(
    programId as Address,
    config,
  ).send();
  if (!Array.isArray(accounts)) {
    throw new Error("getProgramAccounts returned unexpected shape");
  }
  return accounts as readonly RawAccount[];
}

// ───────────────────────────── TicketBatch ──────────────────────────────

export interface FetchTicketBatchesArgs {
  rpc: unknown;
  programId: string;
  /** Restrict to batches in this pool PDA. base58. */
  pool?: string;
  /** Restrict to batches owned by this wallet. base58. */
  owner?: string;
}

/** Find TicketBatch accounts. At least one of `pool` / `owner` should be
 *  passed; the all-batches scan is intentionally not exposed (mainnet
 *  could return tens of thousands of rows). */
export function fetchTicketBatches(
  args: FetchTicketBatchesArgs,
): Promise<readonly RawAccount[]> {
  const filters: unknown[] = [{ dataSize: TICKET_BATCH_SIZE }];
  if (args.pool) {
    filters.push({
      memcmp: { offset: TICKET_BATCH_POOL_OFFSET, bytes: args.pool },
    });
  }
  if (args.owner) {
    filters.push({
      memcmp: { offset: TICKET_BATCH_OWNER_OFFSET, bytes: args.owner },
    });
  }
  return rawAccountsCall(args.rpc, args.programId, {
    commitment: "confirmed",
    encoding: "base64",
    filters,
  });
}

// ───────────────────────────── PrivatePool ──────────────────────────────

export type PoolStateDiscriminant = 0 | 1 | 2;

/** Base58-encoded single-byte memcmp targets for each PoolState. */
const STATE_BYTE_BASE58: Record<PoolStateDiscriminant, string> = {
  0: bs58.encode(Uint8Array.from([0])),
  1: bs58.encode(Uint8Array.from([1])),
  2: bs58.encode(Uint8Array.from([2])),
};

/** Offset of `creator` (Pubkey) inside PrivatePool. First field after the
 *  8-byte Anchor discriminator. */
const PRIVATE_POOL_CREATOR_OFFSET = 8;

export interface FetchPrivatePoolsArgs {
  rpc: unknown;
  programId: string;
  /** When provided, only pools in this state are returned. The RPC uses an
   *  indexed memcmp on the state byte (offset 123) so this is dramatically
   *  cheaper than fetching everything and filtering client-side. */
  state?: PoolStateDiscriminant;
  /** When provided, only pools whose `creator` field equals this base58
   *  pubkey are returned. */
  creator?: string;
}

export function fetchPrivatePools(
  args: FetchPrivatePoolsArgs,
): Promise<readonly RawAccount[]> {
  const filters: unknown[] = [{ dataSize: PRIVATE_POOL_SIZE }];
  if (args.state !== undefined) {
    filters.push({
      memcmp: {
        offset: PRIVATE_POOL_STATE_OFFSET,
        bytes: STATE_BYTE_BASE58[args.state],
        encoding: "base58",
      },
    });
  }
  if (args.creator) {
    filters.push({
      memcmp: { offset: PRIVATE_POOL_CREATOR_OFFSET, bytes: args.creator },
    });
  }
  return rawAccountsCall(args.rpc, args.programId, {
    commitment: "confirmed",
    encoding: "base64",
    filters,
  });
}

// ───────────────────────────── PublicPool ───────────────────────────────

export interface FetchPublicPoolsArgs {
  rpc: unknown;
  programId: string;
}

export function fetchPublicPools(
  args: FetchPublicPoolsArgs,
): Promise<readonly RawAccount[]> {
  return rawAccountsCall(args.rpc, args.programId, {
    commitment: "confirmed",
    encoding: "base64",
    filters: [{ dataSize: PUBLIC_POOL_SIZE }],
  });
}

// ───────────────────────────── helpers ──────────────────────────────────

/** Decode a RawAccount's base64 data into a Uint8Array. Callers then pass
 *  this to the appropriate generated decoder. */
export function decodeAccountBytes(acc: RawAccount): Uint8Array {
  const [b64] = acc.account.data;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

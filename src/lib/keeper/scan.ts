// Server-only: find PrivatePool accounts that need keeper action.
//
// Each tick the cron calls this once, then dispatches commit/settle on each
// returned entry.
//
// Optimization: we run two parallel scans with a state-byte memcmp filter
// rather than one full-table dataSize scan. At small fleet size (devnet
// today) the saving is negligible; at scale it's the difference between
// pulling every Resolved pool every minute vs. only the Open/AwaitingVrf
// ones the keeper actually acts on.

import "server-only";
import { type Address, createSolanaRpc } from "@solana/kit";
import bs58 from "bs58";
import { generated } from "@tombola/sdk";
import {
  PRIVATE_POOL_SIZE_N as PRIVATE_POOL_SIZE,
  PRIVATE_POOL_STATE_OFFSET,
} from "../constants";

const STUCK_THRESHOLD_SEC = 3_600n;

export type PoolAction = "commit" | "settle" | "stuck";

export interface ActionablePool {
  address: string;
  pool: ReturnType<typeof generated.getPrivatePoolDecoder>["decode"] extends (
    b: Uint8Array,
  ) => infer T
    ? T
    : never;
  action: PoolAction;
}

// Base58-encoded single-byte memcmp targets for each PoolState discriminant.
// `getProgramAccounts` expects `bytes` as a base58 string.
const STATE_OPEN_B58 = bs58.encode(Uint8Array.from([0]));
const STATE_AWAITING_VRF_B58 = bs58.encode(Uint8Array.from([1]));

export function classifyPool(
  pool: { state: number; totalTickets: bigint; closeTime: bigint },
  nowSec: bigint,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _stuckThresholdSec: bigint,
): PoolAction | null {
  if (pool.state === 0) {
    if (pool.closeTime <= nowSec && pool.totalTickets > 0n) return "commit";
    return null;
  }
  if (pool.state === 1) {
    // Always attempt settle. waitForReveal / simulate in settle.ts handles
    // staleness; old close_time is not a valid stuck-pool signal.
    return "settle";
  }
  return null;
}

interface RawAccount {
  pubkey: string;
  account: { data: readonly [string, "base64"] };
}

/** Single state-filtered scan. Splitting Open vs. AwaitingVrf lets the RPC
 *  short-circuit on the indexed memcmp byte; pulling them together would
 *  require a 2-byte OR filter (not supported). */
async function scanByState(
  rpc: ReturnType<typeof createSolanaRpc>,
  programId: string,
  stateBytesBase58: string,
): Promise<RawAccount[]> {
  type RpcAny = Record<
    string,
    (...args: unknown[]) => { send(): Promise<unknown> }
  >;
  const accounts = (await (rpc as unknown as RpcAny)["getProgramAccounts"](
    programId as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        { dataSize: PRIVATE_POOL_SIZE },
        {
          memcmp: {
            offset: PRIVATE_POOL_STATE_OFFSET,
            bytes: stateBytesBase58,
            encoding: "base58",
          },
        },
      ],
    },
  ).send()) as ReadonlyArray<RawAccount>;
  if (!Array.isArray(accounts)) {
    throw new Error("getProgramAccounts returned unexpected shape");
  }
  return [...accounts];
}

export async function scanActionablePools(
  rpcUrl: string,
  programId: string,
): Promise<ActionablePool[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const [openAccounts, awaitingAccounts] = await Promise.all([
    scanByState(rpc, programId, STATE_OPEN_B58),
    scanByState(rpc, programId, STATE_AWAITING_VRF_B58),
  ]);

  const decoder = generated.getPrivatePoolDecoder();
  const result: ActionablePool[] = [];
  for (const acc of [...openAccounts, ...awaitingAccounts]) {
    try {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const pool = decoder.decode(bytes);
      const action = classifyPool(
        {
          state: Number(pool.state),
          totalTickets: pool.totalTickets,
          closeTime: pool.closeTime,
        },
        nowSec,
        STUCK_THRESHOLD_SEC,
      );
      if (action) {
        result.push({ address: acc.pubkey, pool, action });
      }
    } catch (err) {
      console.warn(
        `scan: skipping ${acc.pubkey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return result;
}

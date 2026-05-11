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
import { createSolanaRpc } from "@solana/kit";
import { generated } from "@tombola/sdk";
import {
  decodeAccountBytes,
  fetchPrivatePools,
  type PoolStateDiscriminant,
} from "../solana/program-queries";

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

export async function scanActionablePools(
  rpcUrl: string,
  programId: string,
): Promise<ActionablePool[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  // Two parallel state-filtered scans. Splitting Open vs. AwaitingVrf lets
  // the RPC short-circuit on the indexed memcmp byte; pulling them together
  // would require a 2-byte OR filter (not supported by getProgramAccounts).
  const [openAccounts, awaitingAccounts] = await Promise.all([
    fetchPrivatePools({ rpc, programId, state: 0 satisfies PoolStateDiscriminant }),
    fetchPrivatePools({ rpc, programId, state: 1 satisfies PoolStateDiscriminant }),
  ]);

  const decoder = generated.getPrivatePoolDecoder();
  const result: ActionablePool[] = [];
  for (const acc of [...openAccounts, ...awaitingAccounts]) {
    try {
      const bytes = decodeAccountBytes(acc);
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

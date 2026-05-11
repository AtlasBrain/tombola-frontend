// Server-only: find PrivatePool accounts that need keeper action.
//
// Each tick the cron calls this once, then dispatches commit/settle on each
// returned entry.

import "server-only";
import { type Address, createSolanaRpc } from "@solana/kit";
import { generated } from "@tombola/sdk";
import { PRIVATE_POOL_SIZE_N as PRIVATE_POOL_SIZE } from "../constants";

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

  type RpcAny = Record<string, (...args: unknown[]) => { send(): Promise<unknown> }>;
  const accounts = (await (rpc as unknown as RpcAny)["getProgramAccounts"](
    programId as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: PRIVATE_POOL_SIZE }],
    },
  ).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;
  if (!Array.isArray(accounts)) {
    throw new Error("getProgramAccounts returned unexpected shape");
  }

  const decoder = generated.getPrivatePoolDecoder();
  const result: ActionablePool[] = [];
  for (const acc of accounts) {
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

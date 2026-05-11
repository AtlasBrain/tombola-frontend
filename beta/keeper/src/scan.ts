import { type Address, createSolanaRpc } from "@solana/kit";
import { getPrivatePoolDecoder } from "../../../vendor/sdk/generated/accounts/privatePool.ts";
import type { PrivatePool } from "../../../vendor/sdk/generated/accounts/privatePool.ts";

export type PoolAction = "commit" | "settle" | "stuck";

export interface ActionablePool {
  address: string;
  pool: PrivatePool;
  action: PoolAction;
}

// PrivatePool on-chain account size. Verified on devnet (8 discriminator + 208 fields).
const PRIVATE_POOL_SIZE = 216;
// How many seconds after close_time before declaring the oracle stuck.
const STUCK_THRESHOLD_SEC = 3_600n;

/**
 * Pure classifier — determines what action (if any) to take on a decoded pool.
 * Exported for unit testing.
 */
export function classifyPool(
  pool: { state: number; totalTickets: bigint; closeTime: bigint },
  nowSec: bigint,
  stuckThresholdSec: bigint,
): PoolAction | null {
  if (pool.state === 0) {
    if (pool.closeTime <= nowSec && pool.totalTickets > 0n) return "commit";
    return null;
  }
  if (pool.state === 1) {
    // Always attempt settle. waitForReveal in settle.ts bounds polling at 10s,
    // so stale state-1 pools cost a single short tick and then move on.
    // stuckThresholdSec is retained in the signature for backwards compatibility
    // with tests but is no longer used — the original threshold incorrectly
    // measured age from close_time instead of commit_time and skipped freshly
    // committed pools whose close_time was hours old.
    void stuckThresholdSec;
    return "settle";
  }
  return null; // state 2 (Resolved) or unknown
}

/**
 * Fetch all PrivatePool accounts and return those needing action.
 */
export async function scanActionablePools(
  rpcUrl: string,
  programId: string,
): Promise<ActionablePool[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  type RpcAny = Record<string, (...args: unknown[]) => { send(): Promise<unknown> }>;
  const accounts = (await (rpc as unknown as RpcAny)["getProgramAccounts"](
    programId,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: PRIVATE_POOL_SIZE }],
    },
  ).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;

  if (!Array.isArray(accounts)) throw new Error("getProgramAccounts returned unexpected shape");

  const decoder = getPrivatePoolDecoder();
  const result: ActionablePool[] = [];

  for (const acc of accounts) {
    try {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const pool = decoder.decode(bytes);
      const action = classifyPool(
        { state: Number(pool.state), totalTickets: pool.totalTickets, closeTime: pool.closeTime },
        nowSec,
        STUCK_THRESHOLD_SEC,
      );
      if (action) result.push({ address: acc.pubkey, pool, action });
    } catch (err) {
      console.warn(`scan: skipping ${acc.pubkey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// Per-live-pool invite-link metrics for the creator hub at /create.
//
// On chain we only know the merkle root, not the total invite count `N`. The
// total only exists in the creator's localStorage (saved at pool-creation time
// via private-pool-storage.ts). So redemption ratio is shown when codes are
// in this browser; otherwise the row falls back to a "codes not in this
// browser" notice with a link to the per-pool admin.
//
// Discovery of the redeemed count itself is on chain — getProgramAccounts
// with dataSize=105 (RedeemedCode) + memcmp on the pool field returns one
// account per redemption.

import { type Address, createSolanaRpc } from "@solana/kit";

const REDEEMED_CODE_SIZE = 105n;
const POOL_OFFSET = 8n; // first field after 8-byte discriminator

export interface RedemptionMetric {
  /** Total codes minted at create time. null when codes aren't in localStorage. */
  totalCodes: number | null;
  /** Number of RedeemedCode PDAs found for this pool. */
  redeemedCount: number;
}

/**
 * Sequential fetch (one getProgramAccounts per pool) to keep RPC pressure low.
 * Yields per-pool so the UI can update progressively.
 */
export async function* iterateRedemptionMetrics(args: {
  rpcUrl: string;
  programId: string;
  poolAddresses: string[];
  /** Map of poolAddress -> total invite codes. From localStorage; pools the
   *  creator made on a different browser/device will be missing. */
  totalCodesByPool: Map<string, number>;
}): AsyncGenerator<
  { poolAddress: string; metric: RedemptionMetric },
  void,
  unknown
> {
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
            { dataSize: REDEEMED_CODE_SIZE },
            {
              memcmp: { offset: POOL_OFFSET, bytes: poolAddress as Address },
            },
          ],
        },
      ).send()) as ReadonlyArray<unknown>;
      yield {
        poolAddress,
        metric: {
          totalCodes: args.totalCodesByPool.get(poolAddress) ?? null,
          redeemedCount: result.length,
        },
      };
    } catch {
      yield {
        poolAddress,
        metric: {
          totalCodes: args.totalCodesByPool.get(poolAddress) ?? null,
          redeemedCount: 0,
        },
      };
    }
  }
}

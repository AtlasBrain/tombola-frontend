// Global private-pool stats for the homepage "Host your own raffle" section.
//
// Three numbers, all derived from on-chain state:
//   - total SOL minted in private pools  = Σ PrivatePool.totalPot
//   - distinct creators                  = unique PrivatePool.creator across all pools
//   - invite codes redeemed              = count of RedeemedCode PDAs program-wide
//
// We fetch with two getProgramAccounts calls (one per account type, by dataSize)
// — no memcmp filter, so the result is every account of that kind owned by the
// program. On devnet this is small (handful of pools, hundreds of redemptions);
// on mainnet a single global scan would still be fine but should be cached server-
// side if traffic grows.
//
// PrivatePool size = 216 (verified on devnet: 8 disc + 208 fields).
// RedeemedCode size = 105 (8 disc + 97 fields, see vendor SDK getRedeemedCodeSize).

import { type Address, createSolanaRpc } from "@solana/kit";
import { generated } from "@tombola/sdk";
import { PRIVATE_POOL_SIZE } from "./constants";

const REDEEMED_CODE_SIZE = 105n;

export interface GlobalPrivateStats {
  /** Sum of every PrivatePool.totalPot, in lamports. */
  totalPotLamports: bigint;
  /** Distinct PrivatePool.creator count. */
  creatorsCount: number;
  /** Total RedeemedCode PDAs program-wide. */
  redeemedCount: number;
  /** Number of PrivatePool accounts (informational; not displayed by default). */
  poolsCount: number;
}

export async function fetchGlobalPrivateStats(args: {
  rpcUrl: string;
  programId: string;
}): Promise<GlobalPrivateStats> {
  const rpc = createSolanaRpc(args.rpcUrl);

  // Run both program-account scans in parallel — they're independent and the
  // homepage section can render either result alone if one errors.
  const [poolsResult, redeemedResult] = await Promise.allSettled([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rpc.getProgramAccounts as any)(args.programId as Address, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: PRIVATE_POOL_SIZE }],
    }).send() as Promise<
      ReadonlyArray<{
        pubkey: Address;
        account: { data: readonly [string, "base64"] };
      }>
    >,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rpc.getProgramAccounts as any)(args.programId as Address, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: REDEEMED_CODE_SIZE }],
    }).send() as Promise<ReadonlyArray<unknown>>,
  ]);

  let totalPotLamports = 0n;
  let creatorsCount = 0;
  let poolsCount = 0;
  if (poolsResult.status === "fulfilled") {
    const decoder = generated.getPrivatePoolDecoder();
    const creators = new Set<string>();
    for (const acc of poolsResult.value) {
      try {
        const [b64] = acc.account.data;
        const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
        const p = decoder.decode(bytes);
        totalPotLamports += p.totalPot;
        creators.add(String(p.creator));
        poolsCount += 1;
      } catch {
        // skip a pool we can't decode rather than failing the whole stat fetch
      }
    }
    creatorsCount = creators.size;
  }

  const redeemedCount =
    redeemedResult.status === "fulfilled" ? redeemedResult.value.length : 0;

  return { totalPotLamports, creatorsCount, redeemedCount, poolsCount };
}

// ---------- Display helpers (pure, testable) ----------

/** "237 SOL" / "1.2K" / "42" — drops decimals at >=1k for compactness. */
export function formatSolCompact(lamports: bigint): string {
  const sol = Number(lamports) / 1_000_000_000;
  if (sol >= 1_000_000) return `${(sol / 1_000_000).toFixed(1)}M`;
  if (sol >= 1_000) return `${(sol / 1_000).toFixed(1)}K`;
  if (sol >= 100) return Math.round(sol).toString();
  if (sol >= 10) return sol.toFixed(1);
  return sol.toFixed(2);
}

/** "1234" -> "1.2K" / "12" -> "12" */
export function formatCountCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

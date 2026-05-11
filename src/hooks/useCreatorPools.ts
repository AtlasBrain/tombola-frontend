"use client";

// Owns the three-phase data load for the creator dashboard:
//
//   1. findMyPrivatePools  → set of pool addresses the wallet created
//   2. fetchPrivatePool x N → base row data
//   3. Trickle participant counts + streaming redemption metrics
//
// Each phase setState's progressively so the dashboard renders rows the
// instant phase 2 finishes, then fills in the trailing columns as phase 3
// streams in. `reload()` bumps an internal tick to force a fresh fetch
// after a successful pool creation.

import { useCallback, useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";
import {
  createSolanaRpc,
  isSome,
  type Address,
  type Option,
} from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";
import { findMyPrivatePools } from "@/lib/private-pools";
import { loadAllCodesForWallet } from "@/lib/private-pool-storage";
import {
  iterateRedemptionMetrics,
  type RedemptionMetric,
} from "@/lib/creator-pools";
import {
  TICKET_BATCH_POOL_OFFSET,
  TICKET_BATCH_SIZE,
} from "@/lib/constants";

const POOL_OFFSET = BigInt(TICKET_BATCH_POOL_OFFSET);

export interface CreatorPoolRow {
  poolAddress: string;
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  openTimeUnix: number;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creatorFeeBps: number;
  /** Distinct buyer count, filled async. null while loading. */
  participants: number | null;
  /** Per-pool invite-redemption metric, filled async. null while loading. */
  redemption: RedemptionMetric | null;
  feeLamports: bigint;
  winner: string | null;
}

function feeFor(totalPot: bigint, feeBps: number): bigint {
  return (totalPot * BigInt(feeBps)) / 10_000n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accessModeLabel(am: any): "Whitelist" | "OneCodePerTicket" {
  if (typeof am === "number") {
    return am === 0 ? "Whitelist" : "OneCodePerTicket";
  }
  if (am && typeof am === "object" && "__kind" in am) {
    return am.__kind === "WhitelistMode" ? "Whitelist" : "OneCodePerTicket";
  }
  return "Whitelist";
}

export interface UseCreatorPoolsResult {
  pools: CreatorPoolRow[] | null;
  error: string | null;
  reload: () => void;
}

export function useCreatorPools(
  wallet: string | null,
  connection: Connection,
): UseCreatorPoolsResult {
  const [pools, setPools] = useState<CreatorPoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  useEffect(() => {
    if (!wallet) {
      setPools(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const found = await findMyPrivatePools({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          walletAddress: wallet,
        });
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");

        const baseRows = await Promise.all(
          found.map(async ({ address }) => {
            const pool = await fetchPrivatePool(rpc, address as Address);
            const fee = feeFor(pool.data.totalPot, pool.data.creatorFeeBps);
            // Kit decodes Option<Address> as { __option: 'Some', value }.
            // Only show a winner when state is Resolved and Some — zero-ticket
            // voided pools keep state=2 but winner=None.
            const winnerOpt = pool.data.winner as Option<Address>;
            const winner = isSome(winnerOpt) ? String(winnerOpt.value) : null;
            const row: CreatorPoolRow = {
              poolAddress: String(address),
              ticketPriceLamports: pool.data.ticketPrice,
              totalTickets: pool.data.totalTickets,
              totalPotLamports: pool.data.totalPot,
              openTimeUnix: Number(pool.data.openTime),
              closeTimeUnix: Number(pool.data.closeTime),
              state: pool.data.state as 0 | 1 | 2,
              accessMode: accessModeLabel(pool.data.accessMode),
              creatorFeeBps: pool.data.creatorFeeBps,
              participants: null,
              redemption: null,
              feeLamports: fee,
              winner,
            };
            return row;
          }),
        );
        if (cancelled) return;
        baseRows.sort((a, b) => b.openTimeUnix - a.openTimeUnix);
        setPools(baseRows);

        // Build totalCodes map from localStorage so invite ratios show up
        // for live pools created on this browser.
        const stored = loadAllCodesForWallet(wallet);
        const totalCodesByPool = new Map<string, number>();
        for (const s of stored) {
          totalCodesByPool.set(s.poolAddress, s.codes.length);
        }

        // Trickle in participant counts (every pool) + redemption metrics
        // (only for pools still accepting redemptions: Open + before close).
        const nowMs = Date.now();
        const livePoolAddrs = baseRows
          .filter((r) => r.state === 0 && r.closeTimeUnix * 1000 > nowMs)
          .map((r) => r.poolAddress);

        const decoder = generated.getTicketBatchDecoder();
        for (const row of baseRows) {
          if (cancelled) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (await (rpc.getProgramAccounts as any)(
              PROGRAM_ID as Address,
              {
                commitment: "confirmed",
                encoding: "base64",
                filters: [
                  { dataSize: TICKET_BATCH_SIZE },
                  {
                    memcmp: {
                      offset: POOL_OFFSET,
                      bytes: row.poolAddress as Address,
                    },
                  },
                ],
              },
            ).send()) as ReadonlyArray<{
              pubkey: Address;
              account: { data: readonly [string, "base64"] };
            }>;
            const owners = new Set<string>();
            for (const acc of result) {
              const [b64] = acc.account.data;
              const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
              owners.add(String(decoder.decode(bytes).owner));
            }
            if (cancelled) return;
            setPools((prev) =>
              prev
                ? prev.map((p) =>
                    p.poolAddress === row.poolAddress
                      ? { ...p, participants: owners.size }
                      : p,
                  )
                : prev,
            );
          } catch (e) {
            console.warn(
              `participant count failed for ${row.poolAddress}:`,
              e,
            );
            if (cancelled) return;
            setPools((prev) =>
              prev
                ? prev.map((p) =>
                    p.poolAddress === row.poolAddress
                      ? { ...p, participants: 0 }
                      : p,
                  )
                : prev,
            );
          }
        }

        for await (const { poolAddress, metric } of iterateRedemptionMetrics({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          poolAddresses: livePoolAddrs,
          totalCodesByPool,
        })) {
          if (cancelled) return;
          setPools((prev) =>
            prev
              ? prev.map((p) =>
                  p.poolAddress === poolAddress
                    ? { ...p, redemption: metric }
                    : p,
                )
              : prev,
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet, reloadTick]);

  return { pools, error, reload };
}

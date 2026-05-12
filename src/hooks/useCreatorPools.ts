"use client";

// Three-phase data load for the creator dashboard, on react-query:
//
//   Phase 1+2 — base query:
//     findMyPrivatePools  → addresses
//     fetchPrivatePool x N → base rows
//
//   Phase 3 — participant counts (memcmp scan per pool)
//   Phase 4 — streaming RedemptionMetric per live pool
//
//   Phases 3 and 4 run on a follow-up effect that mutates the cached
//   pool list via setQueryData. Same UX as the pre-migration hook: the
//   table renders the moment phase 2 lands, then trailing columns fill
//   in. With the query cache, a second mount finds populated data and
//   skips the entire reload until staleTime expires.
//
// `reload()` invalidates the base query — typically called after a
// successful pool creation.

import { useCallback, useEffect } from "react";
import type { Connection } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSolanaRpc, isSome, type Address, type Option } from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";
import { findMyPrivatePools } from "@/lib/private-pools";
import { loadAllCodesForWallet } from "@/lib/private-pool-storage";
import {
  iterateRedemptionMetrics,
  type RedemptionMetric,
} from "@/lib/creator-pools";
import {
  decodeAccountBytes,
  fetchTicketBatches,
} from "@/lib/solana/program-queries";

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

async function fetchBaseRows(
  wallet: string,
  rpcUrl: string,
): Promise<CreatorPoolRow[]> {
  const found = await findMyPrivatePools({
    rpcUrl,
    programId: PROGRAM_ID,
    walletAddress: wallet,
  });
  const rpc = createSolanaRpc(rpcUrl);
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
  baseRows.sort((a, b) => b.openTimeUnix - a.openTimeUnix);
  return baseRows;
}

export function useCreatorPools(
  wallet: string | null,
  connection: Connection,
): UseCreatorPoolsResult {
  const qc = useQueryClient();
  const queryKey = ["creatorPools", wallet, connection.rpcEndpoint];

  const query = useQuery({
    enabled: !!wallet,
    queryKey,
    queryFn: () => fetchBaseRows(wallet!, connection.rpcEndpoint),
  });

  // Phases 3 + 4 — trickle participant counts then streaming redemption
  // metrics. Mutates the cached pool list in place via setQueryData so
  // subsequent renders see populated columns without a re-fetch.
  useEffect(() => {
    if (!wallet || !query.data) return;
    let cancelled = false;
    (async () => {
      const baseRows = query.data!;
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const decoder = generated.getTicketBatchDecoder();

      // Phase 3 — participant counts per pool (sequential to keep RPC
      // pressure low; the table is usable while these resolve).
      for (const row of baseRows) {
        if (cancelled) return;
        let participantsCount = 0;
        try {
          const result = await fetchTicketBatches({
            rpc,
            programId: PROGRAM_ID,
            pool: row.poolAddress,
          });
          const owners = new Set<string>();
          for (const acc of result) {
            const bytes = decodeAccountBytes(acc);
            owners.add(String(decoder.decode(bytes).owner));
          }
          participantsCount = owners.size;
        } catch (e) {
          console.warn(`participant count failed for ${row.poolAddress}:`, e);
          // Fall through with participantsCount = 0.
        }
        if (cancelled) return;
        qc.setQueryData<CreatorPoolRow[]>(queryKey, (prev) =>
          prev
            ? prev.map((p) =>
                p.poolAddress === row.poolAddress
                  ? { ...p, participants: participantsCount }
                  : p,
              )
            : prev,
        );
      }

      // Phase 4 — streaming redemption metrics for live pools.
      const stored = loadAllCodesForWallet(wallet);
      const totalCodesByPool = new Map<string, number>();
      for (const s of stored) totalCodesByPool.set(s.poolAddress, s.codes.length);

      const nowMs = Date.now();
      const livePoolAddrs = baseRows
        .filter((r) => r.state === 0 && r.closeTimeUnix * 1000 > nowMs)
        .map((r) => r.poolAddress);

      for await (const { poolAddress, metric } of iterateRedemptionMetrics({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        poolAddresses: livePoolAddrs,
        totalCodesByPool,
      })) {
        if (cancelled) return;
        qc.setQueryData<CreatorPoolRow[]>(queryKey, (prev) =>
          prev
            ? prev.map((p) =>
                p.poolAddress === poolAddress ? { ...p, redemption: metric } : p,
              )
            : prev,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // queryKey is derived from the same deps. Intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, connection.rpcEndpoint, query.data]);

  const reload = useCallback(() => {
    qc.invalidateQueries({ queryKey });
    // queryKey is derived from deps, see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, wallet, connection.rpcEndpoint]);

  return {
    pools: query.data ?? null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    reload,
  };
}

"use client";

// Two-phase load for the buyer dashboard:
//
//   1. findMyParticipations  → set of pools the wallet has tickets in
//      (react-query handles cache, dedup, retry)
//   2. iterateParticipantCounts → per-pool participant count, trickled in
//      on a side effect that writes through the same cache entry so
//      subsequent renders see populated counts immediately.

import { useEffect } from "react";
import type { Connection } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PROGRAM_ID } from "@tombola/sdk";
import {
  findMyParticipations,
  iterateParticipantCounts,
  type PoolMembership,
} from "@/lib/buyer-pools";

export interface UseBuyerParticipationsResult {
  pools: PoolMembership[] | null;
  error: string | null;
}

export function useBuyerParticipations(
  wallet: string | null,
  connection: Connection,
): UseBuyerParticipationsResult {
  const qc = useQueryClient();
  const queryKey = ["buyerParticipations", wallet, connection.rpcEndpoint];

  const query = useQuery({
    enabled: !!wallet,
    queryKey,
    queryFn: () =>
      findMyParticipations({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        walletAddress: wallet!,
      }),
  });

  // Trickle participant counts AFTER the base query resolves. We mutate
  // the same cache entry via setQueryData so a re-render lands the
  // population without an explicit setState dance.
  useEffect(() => {
    if (!wallet || !query.data) return;
    let cancelled = false;
    (async () => {
      try {
        for await (const { poolAddress, count } of iterateParticipantCounts({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          poolAddresses: query.data.map((p) => p.poolAddress),
        })) {
          if (cancelled) return;
          qc.setQueryData<PoolMembership[]>(queryKey, (prev) =>
            prev
              ? prev.map((p) =>
                  p.poolAddress === poolAddress
                    ? { ...p, participantsCount: count }
                    : p,
                )
              : prev,
          );
        }
      } catch {
        // network blip — counts stay at their current values.
      }
    })();
    return () => {
      cancelled = true;
    };
    // queryKey is derived from the same deps, intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, connection.rpcEndpoint, query.data]);

  return {
    pools: query.data ?? null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
  };
}

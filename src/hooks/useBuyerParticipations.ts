"use client";

// Owns the buyer dashboard's two-phase data load:
//
//   1. findMyParticipations → set of pools the wallet has tickets in
//   2. Trickle participant counts per pool (async iterator)
//
// `pools` flips from null → array as soon as phase 1 finishes; phase 2 just
// fills in the trailing `participantsCount` field per row.

import { useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";
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
  const [pools, setPools] = useState<PoolMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setPools(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const found = await findMyParticipations({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          walletAddress: wallet,
        });
        if (cancelled) return;
        setPools(found);

        // Trickle in participant counts. The page is usable while these
        // resolve — each pool just shows "…" until its count lands.
        for await (const { poolAddress, count } of iterateParticipantCounts({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          poolAddresses: found.map((p) => p.poolAddress),
        })) {
          if (cancelled) return;
          setPools((prev) =>
            prev
              ? prev.map((p) =>
                  p.poolAddress === poolAddress
                    ? { ...p, participantsCount: count }
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
  }, [connection, wallet]);

  return { pools, error };
}

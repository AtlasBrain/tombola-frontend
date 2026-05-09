// Resolve TicketBatch PDA -> the buy-tx signature that created it.
//
// `getSignaturesForAddress` returns sigs newest-first. For an open pool each
// batch has exactly one signature (the buy). For a settled pool the winner's
// batch may have a settle/close signature on top, so we want the OLDEST sig
// in the returned slice — that's the create. We pull a small page (limit 10)
// and pick the last entry.

import { type Connection, PublicKey } from "@solana/web3.js";

export interface BuySig {
  batchAddress: string;
  signature: string;
  blockTime: number | null;
}

const PER_BATCH_FETCH_LIMIT = 10;

export async function fetchBuySignatures(
  connection: Connection,
  batchAddresses: string[],
): Promise<Map<string, BuySig>> {
  const out = new Map<string, BuySig>();
  if (batchAddresses.length === 0) return out;

  const results = await Promise.all(
    batchAddresses.map(async (addr) => {
      try {
        const sigs = await connection.getSignaturesForAddress(
          new PublicKey(addr),
          { limit: PER_BATCH_FETCH_LIMIT },
        );
        if (sigs.length === 0) return null;
        const oldest = sigs[sigs.length - 1];
        return {
          batchAddress: addr,
          signature: oldest.signature,
          blockTime: oldest.blockTime ?? null,
        } satisfies BuySig;
      } catch {
        return null;
      }
    }),
  );

  for (const r of results) {
    if (r) out.set(r.batchAddress, r);
  }
  return out;
}

/** Format unix seconds as a relative-time string ("3m ago", "2h ago", "5d ago"). */
export function relativeTime(blockTime: number | null, nowSec: number): string {
  if (blockTime === null) return "—";
  const delta = Math.max(0, nowSec - blockTime);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}

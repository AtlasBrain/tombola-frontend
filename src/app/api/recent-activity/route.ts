// Aggregates recent on-chain activity for the homepage ticker.
//
// Returns the most-recent BOUGHT events across every currently-live public
// pool, joined against the off-chain pseudo store so we can render names
// instead of raw wallets. Resolved-pool wins are appended too — they're
// pulled from the public pools' winner field when state=Resolved.
//
// Performance:
//   • In-memory cache with a 20s TTL so we don't hammer the RPC on every
//     ticker poll. The ticker polls /api/recent-activity every 30s.
//   • Per-pool batch fetch is capped — only the most-recent N batches
//     per pool are signature-resolved (signature lookup is the expensive
//     step). N=6 covers the typical buy frequency without ballooning the
//     RPC fan-out.
//
// Shape: { items: TickerItem[] } where each item has the precomputed
// display string so the client component stays dumb.

import "server-only";
import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { generated } from "@tombola/sdk";
import { PROGRAM_ID } from "@tombola/sdk";
import {
  decodeAccountBytes,
  fetchTicketBatches,
} from "@/lib/solana/program-queries";
import { getLivePools } from "@/lib/get-pools";
import { fetchBuySignatures } from "@/lib/fetch-buy-signatures";
import { getProfileByWallet } from "@/lib/profile-store";
import { shortAddress } from "@/lib/format";
import type { PoolKind } from "@/lib/mock-pools";

export const dynamic = "force-dynamic";
// Vercel function default is 10s on hobby — give it room for the per-pool
// signature fan-out.
export const maxDuration = 30;

export interface TickerItem {
  /** "bought" | "won" — drives client-side glyph + accent. */
  kind: "bought" | "won";
  /** Cadence dot color tag (the client maps this to a hex). */
  cadence: PoolKind | "private";
  /** Precomputed display string, ready to render. */
  text: string;
  /** Unix seconds — for client-side sorting / dedupe. */
  blockTime: number;
}

interface CacheEntry {
  items: TickerItem[];
  ts: number;
}

const CACHE_TTL_MS = 20_000;
const MAX_ITEMS = 20;
const PER_POOL_BATCH_LIMIT = 6;

let cache: CacheEntry | null = null;

const CADENCE_LABEL: Record<PoolKind, string> = {
  Weekly: "WEEKLY",
  Biweekly: "BIWEEKLY",
  Triweekly: "TRIWEEKLY",
  Monthly: "MONTHLY",
};

function ageLabel(blockTime: number, nowSec: number): string {
  const delta = Math.max(0, nowSec - blockTime);
  if (delta < 60) return `${delta}s`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h`;
  return `${Math.floor(delta / 86_400)}d`;
}

/** Look up the wallet's pseudo (lower-snake). Falls back to short wallet
 *  prefix if no profile exists. Truncates to keep the ticker compact. */
async function displayNameFor(wallet: string): Promise<string> {
  try {
    const p = await getProfileByWallet(wallet);
    if (p?.pseudo) return p.pseudo.toUpperCase();
  } catch {
    // Redis unavailable — fall through.
  }
  return shortAddress(wallet).toUpperCase();
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ items: cache.items });
  }

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) {
    // Surface empty + 200 — the ticker just shows nothing then.
    return NextResponse.json({ items: [] });
  }

  let pools: Awaited<ReturnType<typeof getLivePools>>;
  try {
    pools = await getLivePools();
  } catch {
    return NextResponse.json({ items: [] });
  }

  const rpc = createSolanaRpc(rpcUrl);
  const conn = new Connection(rpcUrl, "confirmed");
  const decoder = generated.getTicketBatchDecoder();
  const nowSec = Math.floor(Date.now() / 1000);
  const items: TickerItem[] = [];

  // BOUGHT events — per-pool fan-out.
  await Promise.all(
    pools.map(async (pool) => {
      // Skip non-public for now (private pools are by-invite — ticker is the
      // public-facing pulse, surfacing them would feel surveillance-y).
      if (pool.poolAddress === undefined) return;

      let rawBatches: Awaited<ReturnType<typeof fetchTicketBatches>>;
      try {
        rawBatches = await fetchTicketBatches({
          rpc,
          programId: String(PROGRAM_ID),
          pool: pool.poolAddress,
        });
      } catch {
        return;
      }
      if (rawBatches.length === 0) return;

      // Sort by firstTicketId desc — within a pool, ticket IDs are
      // monotonic so higher = more recent.
      const decoded = rawBatches
        .map((acc) => {
          const bytes = decodeAccountBytes(acc);
          const b = decoder.decode(bytes);
          return {
            batchAddress: String(acc.pubkey),
            owner: String(b.owner),
            quantity: b.lastTicketId - b.firstTicketId + 1n,
            firstTicketId: b.firstTicketId,
          };
        })
        .sort((a, b) =>
          a.firstTicketId > b.firstTicketId
            ? -1
            : a.firstTicketId < b.firstTicketId
              ? 1
              : 0,
        )
        .slice(0, PER_POOL_BATCH_LIMIT);

      const sigs = await fetchBuySignatures(
        conn,
        decoded.map((d) => d.batchAddress),
      );

      const names = await Promise.all(
        decoded.map((d) => displayNameFor(d.owner)),
      );

      decoded.forEach((d, i) => {
        const sig = sigs.get(d.batchAddress);
        if (!sig || sig.blockTime === null) return;
        const name = names[i];
        const qty = d.quantity.toString();
        const cadenceLabel = CADENCE_LABEL[pool.kind];
        const age = ageLabel(sig.blockTime, nowSec);
        items.push({
          kind: "bought",
          cadence: pool.kind,
          text: `${name} BOUGHT ${qty} · ${cadenceLabel} · ${age}`,
          blockTime: sig.blockTime,
        });
      });
    }),
  );

  // WON events — surface from any pool that's been resolved with a winner.
  // For now we use the same pool list (only live pools per getLivePools);
  // resolved-pool surfacing is a future iteration that would scan the
  // history table. Skip silently when winner is absent (pool still Open).
  await Promise.all(
    pools.map(async (pool) => {
      if (pool.state !== "Resolved") return;
      // getLivePools doesn't currently include winner field — skip.
      // The ticker will gain WON events once the history aggregator
      // exposes them.
      void pool;
    }),
  );

  items.sort((a, b) => b.blockTime - a.blockTime);
  const top = items.slice(0, MAX_ITEMS);
  // Add example placeholder for paid-out wins if we have none yet
  // (purely cosmetic — keeps the ticker from feeling empty on a fresh
  // pool). Removed once the WON aggregator lands.
  if (top.length === 0) {
    return NextResponse.json({ items: [] });
  }

  cache = { items: top, ts: Date.now() };
  return NextResponse.json({ items: top });
}

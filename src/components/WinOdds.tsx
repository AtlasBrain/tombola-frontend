"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";
import {
  decodeAccountBytes,
  fetchTicketBatches,
} from "@/lib/solana/program-queries";

interface Props {
  /** PublicPool PDA. Required — odds only render for live (non-mock) pools. */
  poolAddress: string;
  /** Total tickets in this round; the denominator. */
  totalTickets: bigint;
  /** CSS color string used for the bar fill. Default mint. */
  accent?: string;
  /** Hypothetical buy qty being typed in a sibling buy-button. When > 0 the
   *  gauge renders a second "After buying" row showing the post-buy odds
   *  alongside the existing one — live as the input changes. */
  previewQty?: number;
}

/**
 * Per-card "your odds" badge — shown when wallet is connected and the user
 * has at least one ticket in this round. Re-runs whenever `totalTickets`
 * changes, so a pool mutation (own buy or someone else's) refetches the
 * user's stake.
 */
export function WinOdds({
  poolAddress,
  totalTickets,
  accent = "#88cfc4",
  previewQty = 0,
}: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [userTickets, setUserTickets] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setUserTickets(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const owner = publicKey.toBase58();
        const accounts = await fetchTicketBatches({
          rpc,
          programId: PROGRAM_ID,
          pool: poolAddress,
          owner,
        });

        const decoder = generated.getTicketBatchDecoder();
        let total = 0n;
        for (const acc of accounts) {
          const bytes = decodeAccountBytes(acc);
          const batch = decoder.decode(bytes);
          total += batch.lastTicketId - batch.firstTicketId + 1n;
        }
        if (!cancelled) setUserTickets(total);
      } catch {
        // network blip — keep last-known value
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, poolAddress, totalTickets]);

  // Hide entirely when there's nothing to show — no wallet, no current
  // tickets AND no preview in progress.
  const validPreview = Number.isFinite(previewQty) && previewQty > 0;
  if (!publicKey || userTickets === null) return null;
  if (userTickets === 0n && !validPreview) return null;
  if (totalTickets === 0n && !validPreview) return null;

  // Single mint-default — emerald is not in the brand palette. Callers can
  // override `accent` for per-cadence treatments.

  // Current odds (integer-only math on bigints; clamp to [0,100] for the bar).
  const currentPctTimes100 =
    totalTickets > 0n
      ? Number((userTickets * 10_000n) / totalTickets) / 100
      : 0;
  const currentPct = Math.min(100, Math.max(0, currentPctTimes100));

  // Hypothetical post-buy odds when the user has typed a valid preview qty.
  let postPct: number | null = null;
  let postOwned: bigint = 0n;
  let postTotal: bigint = 0n;
  if (validPreview) {
    postOwned = userTickets + BigInt(previewQty);
    postTotal = totalTickets + BigInt(previewQty);
    if (postTotal > 0n) {
      const pctTimes100 = Number((postOwned * 10_000n) / postTotal) / 100;
      postPct = Math.min(100, Math.max(0, pctTimes100));
    }
  }

  // Delta (the slice the buyer would gain). Computed from the % values rather
  // than from owned/total bigints so it always matches the on-screen rounding.
  const deltaPct =
    postPct !== null ? Math.max(0, postPct - currentPct) : 0;

  // ──────── PREVIEW MODE (Option G — "before → after" headline + single bar)
  if (validPreview && postPct !== null) {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
        style={{
          borderColor: `${accent}33`,
          background: `${accent}0d`,
        }}
      >
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          After buying {previewQty} ticket{previewQty === 1 ? "" : "s"}
        </div>

        {/* "Before → after" headline. Sized down from a previous mockup — the
            new figure is the headline, the current % is reference, the pill
            shows the gain. */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm tabular-nums text-neutral-400">
            {currentPctTimes100.toFixed(2)}%
          </span>
          <span className="text-xs text-neutral-600">→</span>
          <span
            className="font-display text-base font-bold tabular-nums leading-none"
            style={{ color: accent }}
          >
            {postPct.toFixed(2)}%
          </span>
          <span
            className="ml-0.5 inline-block rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none tabular-nums"
            style={{ background: accent, color: "#000" }}
          >
            +{deltaPct.toFixed(2)}%
          </span>
        </div>

        {/* Single bar — solid current + lighter delta — totals to postPct. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
          <div className="flex h-full w-full">
            {currentPct > 0 && (
              <div
                className="h-full transition-all duration-200"
                style={{ width: `${currentPct}%`, background: accent }}
              />
            )}
            {deltaPct > 0 && (
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${deltaPct}%`,
                  background: accent,
                  opacity: 0.45,
                }}
              />
            )}
          </div>
        </div>

        <div className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-neutral-500">
          {userTickets.toString()} → {postOwned.toString()} of{" "}
          {postTotal.toString()} ticket{postTotal === 1n ? "" : "s"}
        </div>
      </div>
    );
  }

  // ──────── IDLE MODE (no preview) — original single bar
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border px-3 py-2"
      style={{
        borderColor: `${accent}33`,
        background: `${accent}0d`,
      }}
    >
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
        <span className="text-neutral-500">Your odds</span>
        <span className="tabular-nums" style={{ color: accent }}>
          {currentPctTimes100.toFixed(2)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${currentPct}%`, background: accent }}
        />
      </div>
      <div className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-neutral-500">
        {userTickets.toString()} of {totalTickets.toString()} ticket
        {totalTickets === 1n ? "" : "s"}
      </div>
    </div>
  );
}

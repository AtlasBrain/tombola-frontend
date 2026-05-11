"use client";

import { useState } from "react";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import type { PoolTypeValue } from "@tombola/sdk";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  ticketPriceLamports: bigint;
  /** Total tickets sold in this pool. Used as the odds-bar denominator. */
  totalTickets: number;
  /** Hex / CSS color for the bar + button accent. */
  accent: string;
  /** SOL display for the connect-wallet variant of the buy button. */
  ticketPriceSol: number;
}

/**
 * Bottom slab of a public PoolCard: a live "Your odds if you buy N" bar
 * that updates as the user types a quantity into the buy button below it.
 *
 * Reads the buyer's existing tickets as 0 — keeping the homepage card light
 * (no per-card RPC). For pool-detail pages we use the heavier WinOdds, which
 * does fetch the user's existing tickets and renders both the "current" and
 * "after buying" rows.
 *
 * Odds formula: qty / (totalTickets + qty). Falls back to "1 / (total + 1)"
 * — the legacy static display — when qty is invalid / not yet typed.
 */
export function PoolCardBuyOdds({
  poolType,
  round,
  ticketPriceLamports,
  totalTickets,
  accent,
  ticketPriceSol,
}: Props) {
  const [qty, setQty] = useState(1);

  // Defensive — if for some reason the callback fires with a 0 / NaN, fall
  // back to 1 so we always show a sensible "1 ticket" baseline.
  const effectiveQty = qty > 0 && Number.isFinite(qty) ? qty : 1;
  const oddsPct = (effectiveQty * 100) / (totalTickets + effectiveQty);
  const oddsBarPct = Math.min(100, oddsPct);
  const oddsLabel = `${effectiveQty} IN ${(totalTickets + effectiveQty).toLocaleString()}`;

  return (
    <>
      <div className="mt-5">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
          <span className="text-neutral-500">
            ODDS WITH {effectiveQty} TICKET{effectiveQty === 1 ? "" : "S"}
          </span>
          <span className="text-neutral-300">
            {oddsLabel} ({oddsPct.toFixed(oddsPct < 10 ? 2 : 1)}%)
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-900">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${oddsBarPct}%`, background: accent }}
          />
        </div>
      </div>

      <div className="mt-6">
        <BuyTicketButton
          poolType={poolType}
          round={round}
          ticketPriceLamports={ticketPriceLamports}
          closed={false}
          accent={accent}
          ticketPriceSol={ticketPriceSol}
          onQtyChange={setQty}
        />
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import { WinOdds } from "@/components/WinOdds";
import type { PoolTypeValue } from "@tombola/sdk";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  ticketPriceLamports: bigint;
  closed: boolean;
  accentColor?: string;
  ticketPriceSol?: number;
  /** Pool PDA — required for WinOdds to fetch the user's existing tickets. */
  poolAddress: string;
  /** Total tickets sold so far in this round; the WinOdds denominator. */
  totalTickets: bigint;
}

/**
 * Client-side wrapper that owns the live qty <-> previewQty link between
 * BuyTicketButton (where the user types) and WinOdds (where the new odds
 * are overlaid on the existing bar). The public pool page is a server
 * component, so the two siblings can't share state on their own — this
 * wrapper exists purely to bridge them.
 */
export function BuyWithOdds({
  poolType,
  round,
  ticketPriceLamports,
  closed,
  accentColor,
  ticketPriceSol,
  poolAddress,
  totalTickets,
}: Props) {
  const [previewQty, setPreviewQty] = useState(0);
  return (
    <>
      <BuyTicketButton
        poolType={poolType}
        round={round}
        ticketPriceLamports={ticketPriceLamports}
        closed={closed}
        accentColor={accentColor}
        ticketPriceSol={ticketPriceSol}
        onQtyChange={setPreviewQty}
      />
      <div className="mt-4">
        <WinOdds
          poolAddress={poolAddress}
          totalTickets={totalTickets}
          accentColor={accentColor}
          previewQty={previewQty}
        />
      </div>
    </>
  );
}

"use client";

// Re-import the existing buy primitive UNEDITED.
import { BuyTicketPrivateButton } from "@/components/BuyTicketPrivateButton";

interface Props {
  poolPubkey: string;
  /** BigInt as string — matches PoolFetchedState.ticket_price_lamports for
   *  serialization across the server→client boundary. */
  ticketPriceLamports: string;
  tenantPrimaryColor: string;
}

/**
 * Thin wrapper around the existing BuyTicketPrivateButton. Bridges the
 * RaaS pool-detail page's string-serialized props to the buy primitive's
 * bigint-native interface and maps tenantPrimaryColor → accent.
 *
 * Deviations from plan pseudocode (intentional, matches real prop interface):
 *  - plan assumed `poolPubkey` → primitive accepts `poolAddress` (renamed)
 *  - plan passed `ticketPriceLamports: string` → primitive requires `bigint`
 *  - plan omitted `closed` → primitive requires it; always `false` here
 *    (this component only renders when pool.state === "Open" && remainingMs > 0)
 */
export function BrandedBuyButton({
  poolPubkey,
  ticketPriceLamports,
  tenantPrimaryColor,
}: Props) {
  return (
    <div
      style={{ "--tenant-accent": tenantPrimaryColor } as React.CSSProperties}
    >
      <BuyTicketPrivateButton
        poolAddress={poolPubkey}
        ticketPriceLamports={BigInt(ticketPriceLamports)}
        closed={false}
        accent={tenantPrimaryColor}
      />
    </div>
  );
}

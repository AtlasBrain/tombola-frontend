"use client";

import { BrandedBuyButton } from "./BrandedBuyButton";

interface Props {
  poolPubkey: string;
  ticketPriceLamports: string;
  totalTickets: number;
  tenantPrimaryColor: string;
}

export function PathA_DirectBuy(props: Props) {
  return (
    <div className="space-y-3">
      <div className="text-sm opacity-70">You&apos;re ready to buy with SOL.</div>
      <BrandedBuyButton {...props} />
    </div>
  );
}

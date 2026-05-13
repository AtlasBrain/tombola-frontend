"use client";

const PROTOCOL_FEE_BPS = 100;

export function FeeBreakdownPanel({
  ticketPriceLamports,
  creatorFeeBps,
  tenantDisplayName,
}: {
  ticketPriceLamports: bigint;
  creatorFeeBps: number;
  tenantDisplayName: string;
}) {
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  const priceSol = Number(ticketPriceLamports) / Number(LAMPORTS_PER_SOL);
  const creatorPct = creatorFeeBps / 100;
  const protocolPct = PROTOCOL_FEE_BPS / 100;
  const netPct = 100 - creatorPct - protocolPct;

  const creatorLamports = (ticketPriceLamports * BigInt(creatorFeeBps)) / 10_000n;
  const protocolLamports = (ticketPriceLamports * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
  const netLamports = ticketPriceLamports - creatorLamports - protocolLamports;

  const fmtSol = (lamports: bigint) =>
    (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(4);

  return (
    <div className="rounded-md border border-white/10 bg-neutral-900 p-4 space-y-1.5 text-sm font-mono">
      <div className="flex justify-between">
        <span className="opacity-70">Ticket</span>
        <span>{priceSol.toFixed(4)} SOL</span>
      </div>
      <div className="flex justify-between">
        <span>Creator fee ({creatorPct.toFixed(1)}% → {tenantDisplayName})</span>
        <span>{fmtSol(creatorLamports)} SOL</span>
      </div>
      <div className="flex justify-between">
        <span>Protocol fee ({protocolPct.toFixed(1)}% → Tombola)</span>
        <span>{fmtSol(protocolLamports)} SOL</span>
      </div>
      <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1.5 font-semibold">
        <span>To prize pot ({netPct.toFixed(1)}%)</span>
        <span>{fmtSol(netLamports)} SOL</span>
      </div>
    </div>
  );
}

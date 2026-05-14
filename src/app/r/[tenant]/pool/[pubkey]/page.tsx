import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTenant } from "@/lib/raas/tenant";
import { fetchPoolState } from "@/lib/raas/pool-fetch";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import { FeeBreakdownPanel } from "@/components/raas/FeeBreakdownPanel";
import { SmartBuyPanel } from "@/components/raas/SmartBuyPanel";
import { getSolUsd } from "@/lib/raas/sol-usd";
import { WinnerShareSection } from "@/components/raas/WinnerShareSection";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ tenant: string; pubkey: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: slug, pubkey } = await params;
  const tenant = await getTenant(slug);
  const pool = await fetchPoolState(pubkey);
  const title = tenant
    ? `${tenant.display_name} Raffle`
    : "Tombola Raffle";
  const description = pool
    ? `${(Number(pool.total_pot_lamports) / 1e9).toFixed(2)} SOL pot · ${pool.total_tickets} tickets sold`
    : "On-chain raffle";
  return {
    title,
    description,
    openGraph: {
      title,
      images: [`/api/r/og/pool/${pubkey}`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`/api/r/og/pool/${pubkey}`],
    },
  };
}

export default async function PoolDetailPage({ params }: Props) {
  const { tenant: slug, pubkey } = await params;

  const [tenant, pool, solUsd] = await Promise.all([
    getTenant(slug),
    fetchPoolState(pubkey),
    getSolUsd(),
  ]);

  if (!tenant) notFound();
  if (!pool) notFound();

  const nowMs = Date.now();
  const closeMs = pool.close_time * 1_000;
  const remainingMs = closeMs - nowMs;

  const potSol = (Number(pool.total_pot_lamports) / 1e9).toFixed(3);

  function fmtCountdown(ms: number): string {
    if (ms <= 0) return "Closed";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <>
      <BrandedHeader tenant={tenant} />
      <main className="mx-auto max-w-lg px-4 py-8 flex flex-col gap-6">
        <section className="rounded-md border border-white/10 bg-neutral-900 p-5">
          <h1 className="text-lg font-semibold">
            {tenant.display_name} Raffle
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mt-1">
            {pubkey.slice(0, 16)}…
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold tabular-nums">{potSol}</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                SOL pot
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {pool.total_tickets}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                Tickets sold
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {fmtCountdown(remainingMs)}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                {pool.state === "Open"
                  ? "Remaining"
                  : pool.state === "AwaitingVrf"
                  ? "Drawing…"
                  : "closed"}
              </p>
            </div>
          </div>
        </section>

        <FeeBreakdownPanel
          ticketPriceLamports={BigInt(pool.ticket_price_lamports)}
          creatorFeeBps={pool.creator_fee_bps}
          tenantDisplayName={tenant.display_name}
        />

        {pool.state === "Open" && remainingMs > 0 && pool.access_mode === "PublicMode" && (
          <SmartBuyPanel
            poolPubkey={pubkey}
            ticketPriceLamports={pool.ticket_price_lamports}
            totalTickets={pool.total_tickets}
            tenantPrimaryColor={tenant.branding.primary_color}
            tenantDisplayName={tenant.display_name}
            solUsd={solUsd}
          />
        )}

        {pool.winner && (
          <>
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="font-semibold">
                Winner:{" "}
                <span className="font-mono">
                  {pool.winner.slice(0, 16)}…
                </span>
              </p>
            </div>

            {/* Post-settle share button — only shown when pool is Resolved with winner */}
            <WinnerShareSection
              pubkey={pubkey}
              tenantSlug={slug}
              tenantDisplayName={tenant.display_name}
              winner={pool.winner}
              potSol={potSol}
            />
          </>
        )}
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

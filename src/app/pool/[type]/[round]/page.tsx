import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import { Countdown } from "@/components/Countdown";
import { FlashOnChange } from "@/components/FlashOnChange";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { RecentBuysTable } from "@/components/RecentBuysTable";
import { WinnerBanner } from "@/components/WinnerBanner";
import { PreviousWinnerLine } from "@/components/PreviousWinnerLine";
import { WinOdds } from "@/components/WinOdds";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, formatTickets } from "@/lib/format";
import {
  getPoolDetail,
  poolTypeFromSlug,
} from "@/lib/get-pool-detail";
import type { PoolView } from "@/lib/mock-pools";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// Per-cadence accent (matches PoolCard + /my-tickets). Used on the state pill
// and the POT readout so the public detail page reads as the same brand color
// as the homepage card you clicked from.
const POOL_ACCENT: Record<PoolView["kind"], string> = {
  Weekly: "#c9b5dc",
  Biweekly: "#E89999",
  Triweekly: "#88cfc4",
  Monthly: "#e8d89e",
};

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface Params {
  type: string;
  round: string;
}

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { type, round: roundStr } = await params;

  const poolType = poolTypeFromSlug(type);
  if (poolType === null) notFound();

  let round: bigint;
  try {
    round = BigInt(roundStr);
    if (round < 1n) notFound();
  } catch {
    notFound();
  }

  const detail = await getPoolDetail(poolType, round);
  if (!detail) notFound();

  const { pool, batches, winner, winningTicketId } = detail;
  const closed = pool.state !== "Open";

  // Fetch the previous round so we can render a "Previous winner" line on
  // active (non-Resolved) public pool pages. Only attempt it when there is
  // a meaningful previous round (round > 1) AND the current round itself
  // isn't already Resolved (Resolved pools use WinnerBanner instead).
  const prevDetail =
    pool.state !== "Resolved" && round > 1n
      ? await getPoolDetail(poolType, round - 1n)
      : null;
  const prevWinner =
    prevDetail && prevDetail.pool.state === "Resolved" ? prevDetail.winner : null;
  const ticketsForOneSol = (1_000_000_000n / pool.ticketPriceLamports).toString();
  const accent = POOL_ACCENT[pool.kind];

  // State pill — Open uses the pool's per-cadence accent; the others use
  // semantic amber/neutral so "drawing" / "resolved" are unambiguous.
  const badge =
    pool.state === "Open"
      ? {
          label: "Open",
          style: {
            borderColor: `${accent}4d`,
            background: `${accent}1a`,
            color: accent,
          },
          className: "border",
        }
      : pool.state === "AwaitingVrf"
        ? {
            label: "Drawing…",
            style: undefined,
            className:
              "border border-amber-500/30 bg-amber-500/10 text-amber-400",
          }
        : {
            label: "Resolved",
            style: undefined,
            className:
              "border border-neutral-800 bg-neutral-900/50 text-neutral-400",
          };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-20">
      {pool.poolAddress && (
        <LivePoolWatcher addresses={[pool.poolAddress]} rpcUrl={RPC_URL} />
      )}

      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-neutral-500 transition-colors hover:text-neutral-300"
        >
          ← All pools
        </Link>
      </div>

      {prevDetail && prevWinner && prevDetail.pool.poolAddress && (
        <PreviousWinnerLine
          prevPoolAddress={prevDetail.pool.poolAddress}
          winner={prevWinner}
          totalPotLamports={prevDetail.pool.totalPotLamports}
          poolTypeSlug={type}
          prevRound={prevDetail.pool.round}
          accentColor={accent}
        />
      )}

      <header className="mb-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">
              {pool.kind}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Round #{pool.round.toString()}
              {pool.poolAddress && (
                <>
                  {" · "}
                  <a
                    href={explorerAddressUrl(pool.poolAddress, RPC_URL)}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-neutral-300"
                  >
                    {shortAddress(pool.poolAddress)} ↗
                  </a>
                </>
              )}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
            style={badge.style}
          >
            {badge.label}
          </span>
        </div>
      </header>

      <section className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Pot
          </div>
          <div
            className="mt-2 text-4xl font-bold"
            style={{ color: accent }}
          >
            <FlashOnChange value={pool.totalPotLamports.toString()}>
              {formatSol(pool.totalPotLamports)}
            </FlashOnChange>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-neutral-500">Tickets sold</dt>
              <dd className="font-medium text-neutral-200 tabular-nums">
                <FlashOnChange value={pool.totalTickets.toString()}>
                  {formatTickets(pool.totalTickets)}
                </FlashOnChange>
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">{closed ? "Closed" : "Closes in"}</dt>
              <dd className="font-medium text-neutral-200 tabular-nums">
                <Countdown targetUnix={pool.closeTimeUnix} />
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Ticket price</dt>
              <dd className="font-medium text-neutral-200 tabular-nums">
                {formatSol(pool.ticketPriceLamports)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Per 1 SOL</dt>
              <dd className="font-medium text-neutral-200 tabular-nums">
                {ticketsForOneSol} tickets
              </dd>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Buy in
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            {closed
              ? "This round is closed. Once Switchboard randomness lands, the pot pays out and a new round opens."
              : "Pick a quantity. Each ticket has equal odds; more tickets = higher chance."}
          </p>
          <BuyTicketButton
            poolType={pool.poolType}
            round={pool.round}
            ticketPriceLamports={pool.ticketPriceLamports}
            closed={closed}
          />
          {pool.poolAddress && (
            <div className="mt-4">
              <WinOdds
                poolAddress={pool.poolAddress}
                totalTickets={pool.totalTickets}
              />
            </div>
          )}
        </div>
      </section>

      {pool.poolAddress && (
        <WinnerBanner
          poolAddress={pool.poolAddress}
          winner={winner}
          winningTicketId={winningTicketId}
          totalPotLamports={pool.totalPotLamports}
          batches={batches.map((b) => ({
            batchAddress: b.batchAddress,
            owner: b.owner,
            firstTicketId: b.firstTicketId,
            lastTicketId: b.lastTicketId,
          }))}
          state={pool.state}
        />
      )}

      <RecentBuysTable
        batches={batches.map((b) => ({
          batchAddress: b.batchAddress,
          owner: b.owner,
          firstTicketId: b.firstTicketId,
          lastTicketId: b.lastTicketId,
          quantity: b.quantity,
          spentLamports: b.spentLamports,
        }))}
        totalTickets={pool.totalTickets}
        accentColor={accent}
      />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import { Countdown } from "@/components/Countdown";
import { FlashOnChange } from "@/components/FlashOnChange";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, formatTickets } from "@/lib/format";
import {
  getPoolDetail,
  poolTypeFromSlug,
  type TicketBatchView,
} from "@/lib/get-pool-detail";
import type { PoolView } from "@/lib/mock-pools";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const STATE_BADGE: Record<PoolView["state"], { label: string; className: string }> = {
  Open: { label: "Open", className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
  AwaitingVrf: { label: "Drawing…", className: "bg-amber-500/10 text-amber-400 ring-amber-500/20" },
  Resolved: { label: "Resolved", className: "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20" },
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

  const { pool, batches } = detail;
  const badge = STATE_BADGE[pool.state];
  const closed = pool.state !== "Open";
  const ticketsForOneSol = (1_000_000_000n / pool.ticketPriceLamports).toString();

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
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${badge.className}`}
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
          <div className="mt-2 text-4xl font-bold text-emerald-400">
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
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Ticket batches</h2>
          <span className="text-sm text-neutral-500 tabular-nums">
            {batches.length} buyer{batches.length === 1 ? "" : "s"} ·{" "}
            {formatTickets(pool.totalTickets)} ticket
            {pool.totalTickets === 1n ? "" : "s"} sold
          </span>
        </div>

        {batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center text-sm text-neutral-500">
            No tickets bought in this round yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="px-6 pt-4 pb-2 font-medium">Buyer</th>
                  <th className="pt-4 pb-2 font-medium">Tickets</th>
                  <th className="pt-4 pb-2 font-medium">Range</th>
                  <th className="px-6 pt-4 pb-2 text-right font-medium">Spent</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <BatchRow key={b.batchAddress} b={b} rpcUrl={RPC_URL} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BatchRow({ b, rpcUrl }: { b: TicketBatchView; rpcUrl: string }) {
  return (
    <tr className="border-t border-neutral-800/50 transition-colors hover:bg-neutral-900/40">
      <td className="px-6 py-3">
        <a
          href={explorerAddressUrl(b.owner, rpcUrl)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-neutral-300 transition-colors hover:text-neutral-100"
          title={b.owner}
        >
          {shortAddress(b.owner)}
        </a>
      </td>
      <td className="py-3 pr-4 font-medium tabular-nums text-neutral-200">
        {b.quantity.toString()}
      </td>
      <td className="py-3 pr-4 tabular-nums text-neutral-500">
        #{b.firstTicketId.toString()}–#{b.lastTicketId.toString()}
      </td>
      <td className="px-6 py-3 text-right font-medium tabular-nums text-emerald-400">
        {formatSol(b.spentLamports)}
      </td>
    </tr>
  );
}

import Link from "next/link";
import { Countdown } from "./Countdown";
import { BuyTicketButton } from "./BuyTicketButton";
import { FlashOnChange } from "./FlashOnChange";
import { WinOdds } from "./WinOdds";
import { formatSol, formatTickets } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/explorer-url";
import type { PoolView } from "@/lib/mock-pools";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const STATE_BADGE: Record<PoolView["state"], { label: string; className: string }> = {
  Open: { label: "Open", className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
  AwaitingVrf: { label: "Drawing…", className: "bg-amber-500/10 text-amber-400 ring-amber-500/20" },
  Resolved: { label: "Resolved", className: "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20" },
};

export function PoolCard({ pool }: { pool: PoolView }) {
  const badge = STATE_BADGE[pool.state];
  const ticketsForOneSol = (1_000_000_000n / pool.ticketPriceLamports).toString();
  const closed = pool.state !== "Open";

  return (
    <div className="group flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 shadow-lg backdrop-blur-sm transition duration-200 hover:border-neutral-700 hover:bg-neutral-900/70 hover:shadow-xl hover:shadow-emerald-500/5 focus-within:border-emerald-500/40 focus-within:ring-2 focus-within:ring-emerald-500/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            <Link
              href={`/pool/${pool.kind.toLowerCase()}/${pool.round.toString()}`}
              className="transition-colors hover:text-emerald-100"
            >
              {pool.kind}
            </Link>
          </h3>
          <p className="text-sm text-neutral-500">
            Round #{pool.round.toString()}
            {pool.poolAddress && (
              <>
                {" · "}
                <a
                  href={explorerAddressUrl(pool.poolAddress, RPC_URL)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  explorer ↗
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

      <div>
        <div className="text-xs uppercase tracking-wider text-neutral-500">Pot</div>
        <div className="text-3xl font-bold text-emerald-400">
          <FlashOnChange value={pool.totalPotLamports.toString()}>
            {formatSol(pool.totalPotLamports)}
          </FlashOnChange>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-neutral-500">Tickets</dt>
          <dd className="font-medium text-neutral-200">
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
          <dd className="font-medium text-neutral-200">{formatSol(pool.ticketPriceLamports)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Per 1 SOL</dt>
          <dd className="font-medium text-neutral-200">{ticketsForOneSol} tickets</dd>
        </div>
      </dl>

      {pool.poolAddress && (
        <WinOdds
          poolAddress={pool.poolAddress}
          totalTickets={pool.totalTickets}
        />
      )}

      <BuyTicketButton
        poolType={pool.poolType}
        round={pool.round}
        ticketPriceLamports={pool.ticketPriceLamports}
        closed={closed}
      />
    </div>
  );
}

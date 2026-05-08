import { Countdown } from "./Countdown";
import { formatSol, formatTickets } from "@/lib/format";
import type { PoolView } from "@/lib/mock-pools";

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
          <h3 className="text-xl font-semibold tracking-tight">{pool.kind}</h3>
          <p className="text-sm text-neutral-500">Round #{pool.round.toString()}</p>
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
          {formatSol(pool.totalPotLamports)}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-neutral-500">Tickets</dt>
          <dd className="font-medium text-neutral-200">{formatTickets(pool.totalTickets)}</dd>
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

      <button
        type="button"
        disabled
        className="mt-2 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        {closed ? "Round closed" : "Buy ticket — coming soon"}
      </button>
    </div>
  );
}

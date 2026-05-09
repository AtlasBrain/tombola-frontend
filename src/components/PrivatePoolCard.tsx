import Link from "next/link";
import { Countdown } from "./Countdown";
import { formatSol, formatTickets } from "@/lib/format";

interface Props {
  poolAddress: string;
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2; // 0=Open, 1=AwaitingVrf, 2=Resolved
  accessMode: "Whitelist" | "OneCodePerTicket";
}

const STATE_BADGE: Record<Props["state"], { label: string; cls: string }> = {
  0: {
    label: "Open",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  },
  1: {
    label: "Drawing…",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  },
  2: {
    label: "Resolved",
    cls: "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20",
  },
};

export function PrivatePoolCard({
  poolAddress,
  ticketPriceLamports,
  totalTickets,
  totalPotLamports,
  closeTimeUnix,
  state,
  accessMode,
}: Props) {
  const badge = STATE_BADGE[state];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            <Link
              href={`/pool/private/${poolAddress}`}
              className="hover:text-emerald-100"
            >
              Private pool
            </Link>
          </h3>
          <p className="font-mono text-xs text-neutral-500">
            {poolAddress.slice(0, 8)}…{poolAddress.slice(-4)} · {accessMode}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-neutral-500">Pot</div>
        <div className="text-3xl font-bold text-emerald-400">
          {formatSol(totalPotLamports)}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-neutral-500">Tickets</dt>
          <dd className="font-medium">{formatTickets(totalTickets)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">
            {state === 0 ? "Closes in" : "Closed"}
          </dt>
          <dd className="font-medium tabular-nums">
            <Countdown targetUnix={closeTimeUnix} />
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Ticket price</dt>
          <dd className="font-medium">{formatSol(ticketPriceLamports)}</dd>
        </div>
      </dl>
    </div>
  );
}

"use client";
import { formatSol, formatTickets } from "@/lib/format";
import { UserName } from "@/components/UserName";

interface Participant {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
}

interface Props {
  participants: Participant[] | null;
}

const TOP_N = 5;

export function AdminTopBuyersBar({ participants }: Props) {
  if (participants === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Loading participants…
      </div>
    );
  }
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        No tickets sold yet.
      </div>
    );
  }

  const top = participants.slice(0, TOP_N);
  const max = top[0].tickets;
  const totalTickets = participants.reduce(
    (acc, p) => acc + p.tickets,
    0n,
  );
  const totalSpent = participants.reduce(
    (acc, p) => acc + p.spentLamports,
    0n,
  );

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-4 flex items-end justify-between">
        <h3 className="text-xs uppercase tracking-widest text-neutral-500">
          Top buyers
        </h3>
        <p className="text-xs text-neutral-500">
          {participants.length} wallet{participants.length === 1 ? "" : "s"} ·{" "}
          {formatTickets(totalTickets)} tickets · {formatSol(totalSpent)}
        </p>
      </div>
      <ul className="space-y-2">
        {top.map((p) => {
          const widthPct =
            max > 0n ? Math.max(2, Number((p.tickets * 100n) / max)) : 0;
          return (
            <li key={p.owner} className="flex items-center gap-3">
              <code className="w-32 shrink-0 truncate font-mono text-xs text-neutral-400">
                <UserName wallet={p.owner} />
              </code>
              <div className="flex-1">
                <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full"
                    style={{ width: `${widthPct}%`, background: "#88cfc4" }}
                  />
                </div>
              </div>
              <span className="w-32 shrink-0 text-right text-xs tabular-nums text-neutral-300">
                {formatTickets(p.tickets)} · {formatSol(p.spentLamports)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

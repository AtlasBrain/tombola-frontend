import type { PoolView } from "@/lib/mock-pools";

const HEX: Record<PoolView["kind"], string> = {
  Weekly:    "#c9b5dc",
  Biweekly:  "#E89999",
  Triweekly: "#88cfc4",
  Monthly:   "#e8d89e",
};

function formatCloses(p: PoolView): string {
  if (p.state === "AwaitingVrf") return "closed " + ageSince(p.closeTimeUnix) + " ago";
  if (p.state === "Resolved") return "—";
  // Open — countdown
  const now = Math.floor(Date.now() / 1000);
  const dt = p.closeTimeUnix - now;
  if (dt <= 0) return "closing";
  const days = Math.floor(dt / 86400);
  const hours = Math.floor((dt % 86400) / 3600);
  const mins = Math.floor((dt % 3600) / 60);
  const secs = dt % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  if (mins >= 1) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function ageSince(unix: number): string {
  const dt = Math.floor(Date.now() / 1000) - unix;
  if (dt < 60) return `${dt}s`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h`;
  return `${Math.floor(dt / 86400)}d`;
}

function stateMeta(p: PoolView) {
  if (p.state === "Open") {
    return { label: "OPEN", cls: "bg-lime/10 text-lime" };
  }
  if (p.state === "AwaitingVrf") {
    return { label: "DRAWING", cls: "bg-[#e8d89e]/10 text-[#e8d89e]" };
  }
  return { label: "RESOLVED", cls: "bg-neutral-500/10 text-neutral-400" };
}

export function AllRoundsTable({ pools }: { pools: PoolView[] }) {
  // Sort largest pot first
  const ranked = [...pools].sort((a, b) => Number(b.totalPotLamports - a.totalPotLamports));

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <h2 className="mb-6 font-display text-xl uppercase sm:text-2xl">All rounds</h2>

      {/* DESKTOP: full table — 8 columns. Hidden below sm because the
          columns crush together on phones (was the bug the user reported). */}
      <div className="hidden overflow-x-auto rounded-2xl border border-neutral-900 bg-neutral-950 sm:block">
        <table className="w-full text-base">
          <thead className="border-b border-neutral-900">
            <tr className="text-left font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              <th className="px-6 py-4 font-medium">RANK</th>
              <th className="py-4 font-medium">POOL</th>
              <th className="py-4 font-medium">ROUND</th>
              <th className="py-4 font-medium">POT</th>
              <th className="py-4 font-medium">TICKETS</th>
              <th className="py-4 font-medium">BUYERS</th>
              <th className="py-4 font-medium">STATE</th>
              <th className="px-6 py-4 text-right font-medium">CLOSES / WINNER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900/60 font-mono text-sm">
            {ranked.map((p, i) => {
              const accent = HEX[p.kind];
              const tickets = Number(p.totalTickets);
              const buyers = tickets === 0 ? 0 : Math.max(1, Math.round(tickets / 3));
              const potSol = Number(p.totalPotLamports) / 1_000_000_000;
              const state = stateMeta(p);
              return (
                <tr key={p.poolType} className="transition-colors hover:bg-neutral-900/40">
                  <td className="px-6 py-4 text-neutral-500">#{i + 1}</td>
                  <td className="py-4">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                      <span className="text-white">{p.kind.toUpperCase()}</span>
                    </span>
                  </td>
                  <td className="py-4 text-neutral-500">#{p.round.toString()}</td>
                  <td className="py-4" style={{ color: accent }}>{potSol.toFixed(2)} SOL</td>
                  <td className="py-4 text-white">{tickets.toLocaleString()}</td>
                  <td className="py-4 text-neutral-400">{buyers}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${state.cls}`}>
                      {state.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-neutral-400">{formatCloses(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE: card layout. Each round becomes a vertical card with the
          same data laid out as a 2×2 grid + state pill at the top-right.
          Replaces the table below sm to fix the data-overlap bug. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {ranked.map((p, i) => {
          const accent = HEX[p.kind];
          const tickets = Number(p.totalTickets);
          const buyers = tickets === 0 ? 0 : Math.max(1, Math.round(tickets / 3));
          const potSol = Number(p.totalPotLamports) / 1_000_000_000;
          const state = stateMeta(p);
          return (
            <li
              key={p.poolType}
              className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4"
              style={{
                backgroundImage: `linear-gradient(90deg, ${accent}10 0%, transparent 35%)`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: accent }}
                    />
                    <span className="font-display text-base uppercase">
                      {p.kind}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                      · #{p.round.toString()}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                    rank #{i + 1}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${state.cls}`}
                >
                  {state.label}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs">
                <Cell
                  label="Pot"
                  value={`${potSol.toFixed(2)} SOL`}
                  valueColor={accent}
                />
                <Cell label="Tickets" value={tickets.toLocaleString()} />
                <Cell label="Buyers" value={buyers.toString()} />
                <Cell
                  label={
                    p.state === "Open"
                      ? "Closes in"
                      : p.state === "AwaitingVrf"
                        ? "Closed"
                        : "—"
                  }
                  value={formatCloses(p)}
                />
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Cell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className="mt-0.5 font-display text-base uppercase tabular-nums"
        style={{ color: valueColor ?? "#f5f5f5" }}
      >
        {value}
      </div>
    </div>
  );
}

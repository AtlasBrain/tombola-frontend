"use client";
import { Countdown } from "./Countdown";
import { formatSol, formatTickets } from "@/lib/format";

interface Props {
  totalPotLamports: bigint;
  totalTickets: bigint;
  closeTimeUnix: number;
  creatorFeeBps: number;
  state: 0 | 1 | 2;
}

export function AdminDashboardStats({
  totalPotLamports,
  totalTickets,
  closeTimeUnix,
  creatorFeeBps,
  state,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Stat label="Pot" value={formatSol(totalPotLamports)} />
      <Stat label="Tickets" value={formatTickets(totalTickets)} />
      <Stat
        label={state === 0 ? "Closes in" : "Closed"}
        value={<Countdown targetUnix={closeTimeUnix} />}
      />
      <Stat label="Creator fee" value={`${(creatorFeeBps / 100).toFixed(1)}%`} />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-100">{value}</div>
    </div>
  );
}

import { Countdown } from "./Countdown";
import { FlashOnChange } from "./FlashOnChange";
import { formatSol, formatTickets } from "@/lib/format";
import type { PoolView } from "@/lib/mock-pools";

export function StatsBar({ pools }: { pools: PoolView[] }) {
  const totalPot = pools.reduce((acc, p) => acc + p.totalPotLamports, 0n);
  const totalTickets = pools.reduce((acc, p) => acc + p.totalTickets, 0n);
  const activeRounds = pools.filter((p) => p.state === "Open").length;

  // Next pool to close: smallest closeTimeUnix that's still in the future
  // among Open pools. Falls back to the smallest closeTimeUnix overall if
  // everything is past close (rare on a healthy localnet/devnet).
  const now = Math.floor(Date.now() / 1000);
  const candidates = pools.filter(
    (p) => p.state === "Open" && p.closeTimeUnix > now,
  );
  const nextClosing =
    candidates.sort((a, b) => a.closeTimeUnix - b.closeTimeUnix)[0] ?? null;

  return (
    <section className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <Stat
        label="Total pot"
        value={
          <FlashOnChange value={totalPot.toString()}>
            <span className="text-emerald-400">{formatSol(totalPot)}</span>
          </FlashOnChange>
        }
      />
      <Stat
        label="Tickets sold"
        value={
          <FlashOnChange value={totalTickets.toString()}>
            {formatTickets(totalTickets)}
          </FlashOnChange>
        }
      />
      <Stat
        label="Active rounds"
        value={<span className="tabular-nums">{activeRounds}</span>}
      />
      <Stat
        label={nextClosing ? `Next close · ${nextClosing.kind}` : "Next close"}
        value={
          nextClosing ? (
            <span className="tabular-nums">
              <Countdown targetUnix={nextClosing.closeTimeUnix} />
            </span>
          ) : (
            <span className="text-neutral-500">—</span>
          )
        }
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
      <div className="text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-neutral-100 sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

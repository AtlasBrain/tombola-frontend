import Link from "next/link";
import { FlashOnChange } from "./FlashOnChange";
import { formatSol } from "@/lib/format";
import type { PoolView } from "@/lib/mock-pools";

/**
 * 4-column vertical bar chart comparing pots across the four pools.
 *
 * Bars are heights as percentages of the largest pot — gives an
 * at-a-glance answer to "which pool is fattest right now". Clicking a
 * column navigates to that pool's detail page.
 *
 * Pure CSS, no chart lib. The minimum bar height (8%) keeps even an
 * empty pool visible so the chart doesn't render with collapsed bars
 * on day-zero state.
 */
export function PoolComparisonChart({ pools }: { pools: PoolView[] }) {
  const max = pools.reduce(
    (acc, p) => (p.totalPotLamports > acc ? p.totalPotLamports : acc),
    0n,
  );

  return (
    <section className="mb-12 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-xl font-semibold">Pot comparison</h2>
        <span className="text-xs text-neutral-500">all four public pools</span>
      </div>
      <div className="flex h-48 items-end gap-3 sm:gap-6">
        {pools.map((pool) => {
          const heightPct =
            max === 0n
              ? 8
              : Math.max(
                  8,
                  Number((pool.totalPotLamports * 100n) / max),
                );
          return (
            <Link
              key={pool.poolType}
              href={`/pool/${pool.kind.toLowerCase()}/${pool.round.toString()}`}
              className="group flex flex-1 flex-col items-center gap-2"
            >
              <FlashOnChange value={pool.totalPotLamports.toString()}>
                <span className="text-xs font-medium tabular-nums text-neutral-300 group-hover:text-emerald-300">
                  {formatSol(pool.totalPotLamports)}
                </span>
              </FlashOnChange>
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-500/30 to-emerald-500/70 transition-all duration-700 group-hover:from-emerald-500/40 group-hover:to-emerald-400"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-xs text-neutral-500 group-hover:text-neutral-300">
                {pool.kind}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

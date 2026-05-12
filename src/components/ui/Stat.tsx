// Shared label/value display tiles used across dashboards and the profile card.
//
// Three visual variants, kept in one file because they share the same shape:
//
//   <Stat>      — bordered card. ~2xl display value. For top-of-page KPIs
//                 (BuyerDashboard, CreatorDashboard).
//   <Metric>    — no border, ~lg display value. For row-of-metrics under a
//                 per-row card.
//   <StatTile>  — no border, base font + bold. For ProfileCard's dense grid.
//
// Same props across the three so callers can refactor between variants
// without rewriting prop wiring.

interface StatProps {
  label: string;
  /** Big display value. Accepts a plain string OR JSX so callers can
   *  embed live components like <Countdown />. */
  value: React.ReactNode;
  /** Optional secondary line under the value. Same shape — accepts JSX
   *  for things like <UserName />. */
  sub?: React.ReactNode;
  /** CSS color for the value text. Falls back to neutral-100. */
  valueColor?: string;
}

/** Bordered KPI tile. Used at the top of BuyerDashboard / CreatorDashboard. */
export function Stat({ label, value, sub, valueColor }: StatProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className="mt-1 font-display text-2xl uppercase tabular-nums"
        style={{ color: valueColor ?? "#f5f5f5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

/** Borderless metric. Used inside per-row cards in BuyerDashboard / CreatorDashboard. */
export function Metric({ label, value, sub, valueColor }: StatProps) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className="mt-0.5 font-display text-lg uppercase tabular-nums"
        style={{ color: valueColor ?? "#f5f5f5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] tabular-nums text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

/** Compact dense-grid tile. Used in ProfileCard's stat grid. */
export function StatTile({ label, value, sub, valueColor }: StatProps) {
  return (
    <div>
      <span className="block font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div
        className="mt-1 font-display text-base font-bold tabular-nums leading-none"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] text-neutral-600">
          {sub}
        </div>
      )}
    </div>
  );
}

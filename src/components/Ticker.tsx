/**
 * Top-of-page marquee. Server component — content is static for now;
 * a future task may wire it to LivePoolWatcher events.
 *
 * The marquee technique: a horizontal flex of items, duplicated once,
 * inside a `width: max-content` container animated with `translateX(-50%)`
 * over 60s (see `.ticker-track` in globals.css). The duplicate makes the
 * loop seamless.
 *
 * Exact port from public/redesign-v1-recolored.html lines 326-350.
 */

type TickerItem = {
  readonly dot: string;   // CSS color for the dot
  readonly text: string;  // full label e.g. "9XQT…DWY8 BOUGHT 5 · WEEKLY · 12s"
};

const ITEMS: readonly TickerItem[] = [
  { dot: "var(--lavender)", text: "9XQT…DWY8 BOUGHT 5 · WEEKLY · 12s" },
  { dot: "#E89999",         text: "EAAL…PLBT BOUGHT 20 · BIWEEKLY · 47s" },
  { dot: "#88cfc4",         text: "QWYK…ZB1M BOUGHT 1 · TRIWEEKLY · 1m" },
  { dot: "var(--lavender)", text: "HMSQ…YJNW BOUGHT 3 · WEEKLY · 2m" },
  { dot: "#e8d89e",         text: "2UHK…Z8JA WON 10.18 SOL · MONTHLY · #2" },
  { dot: "var(--lavender)", text: "AXWU…CW7V BOUGHT 50 · WEEKLY · 4m" },
  { dot: "#E89999",         text: "6ZXW…5TM BOUGHT 8 · BIWEEKLY · 5m" },
];

function TickerSpan() {
  return (
    <span className="flex gap-10">
      {ITEMS.map((item, i) => (
        <span key={i}>
          <span style={{ color: item.dot }}>●</span> {item.text}
        </span>
      ))}
    </span>
  );
}

export function Ticker() {
  return (
    <div className="border-b border-neutral-900/80 bg-black/95">
      <div className="overflow-hidden py-2.5 text-[11px] uppercase tracking-wider text-neutral-500">
        <div className="ticker-track flex gap-10 whitespace-nowrap font-mono">
          <TickerSpan />
          <span aria-hidden="true" className="flex gap-10">
            {ITEMS.map((item, i) => (
              <span key={i}>
                <span style={{ color: item.dot }}>●</span> {item.text}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

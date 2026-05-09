/**
 * Top-of-page marquee. Server component — content is static for now;
 * a future task may wire it to LivePoolWatcher events.
 *
 * The marquee technique: a horizontal flex of items, duplicated once,
 * inside a `width: max-content` container animated with `translateX(-50%)`
 * over 60s (see `.ticker-track` in globals.css). The duplicate makes the
 * loop seamless.
 */
type TickerEvent = {
  readonly tag: string;     // e.g. "BOUGHT 5"
  readonly type: string;    // e.g. "WEEKLY"
  readonly age: string;     // e.g. "12s"
  readonly accent?: string; // CSS color
};

const EVENTS: readonly TickerEvent[] = [
  { tag: "BOUGHT 5",  type: "WEEKLY",    age: "12s", accent: "var(--lavender)" },
  { tag: "BOUGHT 20", type: "BIWEEKLY",  age: "47s", accent: "var(--mint)" },
  { tag: "BOUGHT 1",  type: "TRIWEEKLY", age: "1m",  accent: "var(--yellow)" },
  { tag: "BOUGHT 3",  type: "WEEKLY",    age: "2m",  accent: "var(--lavender)" },
  { tag: "WON 10.18 SOL", type: "MONTHLY",  age: "#2",  accent: "var(--pink)" },
  { tag: "BOUGHT 50", type: "WEEKLY",    age: "4m",  accent: "var(--lavender)" },
];

function Item({ ev }: { ev: TickerEvent }) {
  return (
    <span className="inline-flex items-center gap-3 px-6 text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-mono">
      <span className="size-1.5 rounded-full" style={{ background: ev.accent ?? "var(--lavender)" }} aria-hidden />
      <span className="text-white">{ev.tag}</span>
      <span>·</span>
      <span>{ev.type}</span>
      <span>·</span>
      <span className="text-neutral-500">{ev.age}</span>
    </span>
  );
}

export function Ticker() {
  const doubled = [...EVENTS, ...EVENTS];
  return (
    <div className="overflow-hidden border-b border-white/5 bg-black/30 backdrop-blur">
      <div className="ticker-track flex py-2">
        {doubled.map((ev, i) => (
          <Item key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}

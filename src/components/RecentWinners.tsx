/**
 * "Recently played on Tombola" feed — exact-port from
 * public/redesign-v1-recolored.html lines 784-860.
 *
 * Server component for now. Reads a small fixed list of mock events;
 * future task wires this to LivePoolWatcher event stream.
 */
type FeedKind = "Weekly" | "Biweekly" | "Triweekly" | "Monthly";

const SHORT: Record<FeedKind, string> = {
  Weekly:    "WKLY",
  Biweekly:  "BIWK",
  Triweekly: "TRIWK",
  Monthly:   "MTHLY",
};

type Event = {
  kind: FeedKind;
  round: number;
  summary: string;
  age: string;
  /** Override accent hex — mockup assigns distinct colors per row */
  accent: string;
};

const EVENTS: readonly Event[] = [
  { kind: "Monthly",   round: 2, summary: "won by 2uHK…z8JA — 10.18 SOL",            age: "3 MINS AGO",  accent: "#e8d89e" },
  { kind: "Weekly",    round: 1, summary: "9xQT…DWY8 just bought 5 tickets",          age: "12 SECS AGO", accent: "#c9b5dc" },
  { kind: "Triweekly", round: 1, summary: "drawing now — Switchboard reveal pending",  age: "2 HRS AGO",   accent: "#88cfc4" },
  { kind: "Biweekly",  round: 1, summary: "EaAL…pLBt bought 20 tickets",              age: "47 SECS AGO", accent: "#b8a5d4" },
  { kind: "Triweekly", round: 0, summary: "won by qWyk…ZB1M — 4.84 SOL",              age: "3 DAYS AGO",  accent: "#e8a5c0" },
];

export function RecentWinners() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <h2 className="mb-6 font-display text-xl uppercase text-lime sm:text-2xl">
        Recently played on Tombola
      </h2>
      <ul className="space-y-2">
        {EVENTS.map((ev, i) => (
          <li key={i}>
            <a
              href="#"
              className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-900 bg-neutral-950 px-5 py-3.5 transition-colors hover:bg-neutral-900/80"
            >
              <span className="flex items-center gap-4">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: ev.accent }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><circle cx="12" cy="12" r="10" /></svg>
                </span>
                <span className="flex items-center gap-3 font-mono text-sm uppercase">
                  <span style={{ color: ev.accent }}>{SHORT[ev.kind]}</span>
                  <span className="text-white normal-case">{ev.kind} Round #{ev.round}</span>
                  <span className="text-neutral-500 normal-case">{ev.summary}</span>
                </span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-600">{ev.age} ›</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-center">
        <button className="btn-fx fx-inset flex items-center gap-2 rounded-full border border-neutral-800 px-5 py-2 font-mono text-xs uppercase tracking-widest text-neutral-300 transition hover:text-black hover:border-transparent">
          VIEW ALL <span className="chip-flip text-lime">›</span>
        </button>
      </div>
    </section>
  );
}

/**
 * "Why it's fair" — 3 feature cards. Exact port from
 * public/redesign-v1-recolored.html lines 934-1026.
 */
export function WhyItsFair() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="mb-10 max-w-2xl">
        <h2 className="font-display text-3xl uppercase sm:text-5xl">Why it&apos;s fair</h2>
        <p className="mt-3 text-neutral-400">
          Three things that make Tombola different from a centralized raffle.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Card 1 — Verifiable randomness with hex grid */}
        <div className="overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <h3 className="font-display text-xl uppercase">Verifiable<br />randomness</h3>
          <p className="mt-2 text-sm text-neutral-400">
            Switchboard On-Demand posts a signed reveal on-chain. No one can predict or influence the result.
          </p>
          <div className="mt-6 grid grid-cols-8 gap-1 font-mono">
            {[
              ["a3", 40], ["7f", 30], ["22", 50], ["e1", 20], ["9c", 40], ["5b", 30], ["04", 50], ["d7", 20],
              ["3a", 30], ["88", 40], ["f2", 20], ["11", 50], ["be", 30], ["06", 40], ["a5", 20], ["cf", 50],
            ].map(([txt, op], i) => (
              <span
                key={i}
                className="rounded px-1 text-center text-[10px]"
                style={{ background: `rgba(184, 165, 212, ${(op as number) / 100})` }}
              >
                {txt}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ Switchboard</span>
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ Audited byte-offsets</span>
          </div>
        </div>

        {/* Card 2 — Instant payouts */}
        <div className="overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <h3 className="font-display text-xl uppercase">Instant<br />payouts</h3>
          <p className="mt-2 text-sm text-neutral-400">
            When the winner is picked, the entire pot lands in their wallet in the same transaction.
          </p>
          <div className="mt-6 flex items-center justify-between gap-2 rounded-2xl border border-neutral-800 bg-black p-4">
            <div className="text-center">
              <div className="font-display text-3xl text-lime">10.18</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">SOL POT</div>
            </div>
            <svg width="40" height="20" viewBox="0 0 40 20" className="text-lime" aria-hidden>
              <line x1="2" y1="10" x2="34" y2="10" stroke="currentColor" strokeWidth="2" />
              <polyline points="28,4 34,10 28,16" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="text-center">
              <div className="font-mono text-sm text-white">2uHK…z8JA</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">WINNER</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ One-tx settle</span>
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ 0.5% to treasury</span>
          </div>
        </div>

        {/* Card 3 — Audit-ready */}
        <div className="overflow-hidden rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <h3 className="font-display text-xl uppercase">Audit-ready<br />code</h3>
          <p className="mt-2 text-sm text-neutral-400">
            71 design decisions, 86 Rust tests, threat model published. Multisig upgrade authority before mainnet.
          </p>
          <div className="mt-6 space-y-1.5">
            {[
              { label: "LITESVM",   pct: 85, count: 86 },
              { label: "PROPTEST",  pct: 60, count: 16 },
              { label: "TS UNIT",   pct: 45, count: 36 },
              { label: "FRONTEND",  pct: 55, count: 47 },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-20 text-neutral-500">{b.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-900">
                  <div className="h-full rounded-full bg-lime" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="w-8 text-right text-lime">{b.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ Open source</span>
            <span className="rounded-full border border-neutral-800 px-2 py-0.5">+ CI on every PR</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Buy a ticket",
    body:
      "Send SOL into a pool. Each ticket carries equal odds; the more you hold, the higher your chance.",
  },
  {
    n: "02",
    title: "Wait for the draw",
    body:
      "When the pool closes, Switchboard On-Demand posts a verifiable random number on-chain to pick the winner.",
  },
  {
    n: "03",
    title: "Claim your win",
    body:
      "If your ticket is drawn, the entire pot (minus the 0.5% protocol fee) routes to your wallet.",
  },
];

export function HowItWorks() {
  return (
    <section className="mb-12 sm:mb-20">
      <h2 className="mb-6 text-xl font-semibold">How it works</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm"
          >
            <div className="text-sm font-medium tabular-nums text-emerald-400">
              {s.n}
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">
              {s.title}
            </h3>
            <p className="mt-2 text-sm text-neutral-400">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

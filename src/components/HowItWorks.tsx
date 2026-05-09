/**
 * "From idea to win in three steps." — exact port from
 * public/redesign-v1-recolored.html lines 1027-1050.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-8 sm:p-12">
        <h2 className="font-display text-3xl uppercase sm:text-4xl">
          From idea to win<br />in three steps.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime font-mono text-xs font-bold text-black">01</div>
            <h3 className="mt-4 font-display text-lg uppercase">Pick &amp; buy</h3>
            <p className="mt-2 text-sm text-neutral-400">
              Each ticket is 0.01 SOL. The more you hold, the higher your chance.
            </p>
          </div>
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E89999] font-mono text-xs font-bold text-black">02</div>
            <h3 className="mt-4 font-display text-lg uppercase">Wait for draw</h3>
            <p className="mt-2 text-sm text-neutral-400">
              Switchboard On-Demand posts a verifiable random number on-chain.
            </p>
          </div>
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8d89e] font-mono text-xs font-bold text-black">03</div>
            <h3 className="mt-4 font-display text-lg uppercase">Auto-payout</h3>
            <p className="mt-2 text-sm text-neutral-400">
              Winning ticket gets the pot directly. No claim step. 0.5% to treasury.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

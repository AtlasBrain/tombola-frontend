const FAQS = [
  {
    q: "Is the randomness really random?",
    a: "Yes. The winning ticket is picked using Switchboard On-Demand verifiable randomness. The oracle network signs a randomness response on-chain; the program parses it (audited byte-offset, D-035) and computes winner = randomness mod total_tickets. No party — including the protocol team — can predict or influence the result before the draw closes.",
  },
  {
    q: "What's the fee?",
    a: "0.5% of every pot. It's transferred to the protocol treasury automatically when the winner is settled — same transaction as the payout. There are no per-ticket fees, no withdrawal fees, and no hidden cuts. The treasury address is set once at protocol init and visible on-chain (see the program ID link below).",
  },
  {
    q: "Can the team rug?",
    a: "Ticket SOL sits in the on-chain pool account, controlled by the raffle program — not any team wallet. The only attack surface is the program's upgrade authority, which (per design decision D-009) rotates to a 2-of-3 Squads multisig before mainnet. After that, no single signer can change program logic. The treasury wallet only ever receives the 0.5% fee post-draw; it never holds user funds at rest.",
  },
  {
    q: "What happens if no one buys a ticket?",
    a: "The pool stays Open until close_time. After close, anyone can permissionlessly trigger the draw — but with 0 tickets the program enters a no-winner state and can be reopened (round counter bumps by 1). SOL never gets stuck because there's nothing in the pot.",
  },
  {
    q: "How do I claim a win?",
    a: "You don't claim — the program transfers the pot (minus the 0.5% fee) directly to the winning ticket's owner address as part of the settle-draw transaction. Watch your wallet balance after the round closes.",
  },
];

export function FaqSection() {
  return (
    <section className="mt-20 mb-12">
      <h2 className="mb-6 text-xl font-semibold">FAQ</h2>
      <div className="flex flex-col gap-2">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group rounded-2xl border border-neutral-800 bg-neutral-900/50 px-6 py-4 backdrop-blur-sm transition-colors hover:border-neutral-700 [&[open]]:border-neutral-700"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-neutral-200 marker:hidden">
              <span>{f.q}</span>
              <span
                aria-hidden
                className="text-neutral-500 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

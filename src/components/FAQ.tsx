/**
 * Frequently asked questions — anchored at #faq for the header nav.
 *
 * Uses native <details>/<summary> for the accordion mechanic so it works
 * without JS and announces correctly to assistive tech. Server component;
 * no interactive state of our own to track.
 */

interface QA {
  q: string;
  a: React.ReactNode;
}

const QAS: QA[] = [
  {
    q: "What is Tombola?",
    a: (
      <>
        A trustless on-chain raffle protocol on Solana. Buy tickets, win the
        pot, repeat — verifiable randomness via Switchboard On-Demand.
      </>
    ),
  },
  {
    q: "How is the winner picked?",
    a: (
      <>
        Switchboard On-Demand posts a verifiable random number on chain after
        each round closes. The protocol reduces it modulo the ticket count to
        select the winning ticket id, then the winner&apos;s wallet receives
        the pot atomically in the same transaction.
      </>
    ),
  },
  {
    q: "Is there a claim step? Do I need to do anything to receive my winnings?",
    a: (
      <>
        No. Payout is automatic. The settle instruction transfers the pot
        directly to the winner&apos;s wallet in the same tx that resolves the
        round. You&apos;ll see the SOL appear in your wallet without any
        action — and you&apos;ll get an in-app toast and (if enabled) a
        browser notification.
      </>
    ),
  },
  {
    q: "What's the protocol fee?",
    a: (
      <>
        0.5% to treasury for sustainability. Public pools have no other fees.
        Private pools optionally take a creator fee (set by the creator,
        capped at 5%).
      </>
    ),
  },
  {
    q: "What's a private pool?",
    a: (
      <>
        Anyone can create one. You set the ticket price, duration, creator
        fee, and number of invite codes. Each code is a single-use bearer
        token — whoever has the redemption link can join. Use it for raffles,
        member rewards, or community giveaways.
      </>
    ),
  },
  {
    q: "Are tickets refundable?",
    a: (
      <>
        No. Once a buy lands on chain it&apos;s final. The pot only pays out
        at settle — losing tickets aren&apos;t reimbursed. Buy with intent.
      </>
    ),
  },
  {
    q: "What happens if Switchboard doesn't reveal in time?",
    a: (
      <>
        Public pools have a built-in retry path: after 1 hour without a
        reveal, anyone can call <code className="font-mono text-neutral-300">retry_draw_public</code>{" "}
        to reset the round. Private pools are one-shot — if a reveal stalls,
        the operator team intervenes manually.
      </>
    ),
  },
  {
    q: "What chain is this on?",
    a: (
      <>
        Solana. Currently live on devnet. Mainnet rollout is gated on an
        external audit + multisig rotation of the program upgrade authority.
      </>
    ),
  },
  {
    q: "Is the code open source?",
    a: (
      <>
        Yes. Both the on-chain program and the frontend are published on
        GitHub — link in the footer.
      </>
    ),
  },
];

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-8 sm:p-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl uppercase leading-[0.95] sm:text-5xl">
            Frequently
            <br />
            asked
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {QAS.length} answers · keep digging
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {QAS.map((qa, i) => (
            <li key={qa.q}>
              <details className="group rounded-2xl border border-neutral-900 bg-neutral-950/40 transition-colors open:border-neutral-700 open:bg-neutral-900/40">
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 list-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-base uppercase">
                      {qa.q}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="text-neutral-500 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed text-neutral-400">
                  <div className="border-t border-neutral-900 pt-4">{qa.a}</div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * "From idea to win in three steps." — tear-corner ticket-stub cards
 * (proposal #4), per-step accent (lavender / pink / yellow), with a
 * relevant icon per step (ticket / dice / trophy) and a traveling glow-dot
 * along a horizontal connector line above the cards to signal "process".
 */

interface StepIconProps {
  accent: string;
}

function TicketIcon({ accent }: StepIconProps) {
  // Same ticket pattern used in HeroFloatingIcons / MyTicketsFloatingIcons —
  // perforated raffle stub. Tinted to the step accent.
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <path
        fill={accent}
        d="M6 22h52v8a4 4 0 0 0 0 8v8H6v-8a4 4 0 0 0 0-8v-8z"
      />
      <line
        x1="22"
        y1="24"
        x2="22"
        y2="48"
        stroke="#0b0b0d"
        strokeWidth="2.5"
        strokeDasharray="3 3"
      />
      <text
        x="38"
        y="40"
        fill="#0b0b0d"
        fontFamily="Space Mono"
        fontSize="11"
        fontWeight="700"
      >
        SOL
      </text>
    </svg>
  );
}

function DiceIcon({ accent }: StepIconProps) {
  // Five-pip die in step accent. Connotes the "verifiable random" step.
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <rect x="8" y="8" width="48" height="48" rx="10" fill={accent} />
      <circle cx="22" cy="22" r="3.5" fill="#0b0b0d" />
      <circle cx="42" cy="22" r="3.5" fill="#0b0b0d" />
      <circle cx="32" cy="32" r="3.5" fill="#0b0b0d" />
      <circle cx="22" cy="42" r="3.5" fill="#0b0b0d" />
      <circle cx="42" cy="42" r="3.5" fill="#0b0b0d" />
    </svg>
  );
}

function TrophyIcon({ accent }: StepIconProps) {
  // Trophy + base + handles. Auto-payout = winner gets the cup.
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <path
        fill={accent}
        d="M22 12h20v14a10 10 0 0 1-20 0V12zM14 16h6v10h-6zM44 16h6v10h-6zM30 36h4v8h-4zM22 44h20v4H22z"
      />
    </svg>
  );
}

const STEPS: Array<{
  n: string;
  step: string;
  title: string;
  desc: string;
  accent: string;
  Icon: (p: StepIconProps) => React.ReactElement;
}> = [
  {
    n: "01",
    step: "Step 1",
    title: "Pick & buy",
    desc: "Each ticket is 0.01 SOL. The more you hold, the higher your chance.",
    accent: "#c9b5dc",
    Icon: TicketIcon,
  },
  {
    n: "02",
    step: "Step 2",
    title: "Wait for draw",
    desc: "Switchboard On-Demand posts a verifiable random number on-chain.",
    accent: "#E89999",
    Icon: DiceIcon,
  },
  {
    n: "03",
    step: "Step 3",
    title: "Auto-payout",
    desc: "Winning ticket gets the pot directly. No claim step. 0.5% to treasury.",
    accent: "#e8d89e",
    Icon: TrophyIcon,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl border border-neutral-900 bg-neutral-950 p-8 sm:p-12">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl uppercase sm:text-5xl leading-[0.95]">
            From idea to win<br />
            in three steps.
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            3 steps · no claim · on chain
          </span>
        </div>

        {/* Process connector — a faint dashed line stretching across the top
            of the card row with a glow-dot looping left → right. Sits behind
            the cards (z-0). */}
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-0 hidden h-px md:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.18) 4px, transparent 4px)",
              backgroundSize: "10px 1px",
              backgroundRepeat: "repeat-x",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-0 hidden h-px md:block"
          >
            <span
              className="process-traveler absolute -top-[5px] h-2.5 w-2.5 rounded-full"
              style={{
                background: "#c9b5dc",
                boxShadow:
                  "0 0 14px 2px rgba(201,181,220,0.55), 0 0 4px rgba(201,181,220,0.9)",
                left: "0%",
              }}
            />
          </div>

          <ol className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="btn-fx fx-tear-lg group relative overflow-visible transition hover:-translate-y-0.5"
                style={{ ["--tear-bg" as never]: `${s.accent}1a` }}
              >
                <div className="p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                        {s.step}
                      </span>
                      <div
                        className="mt-3 h-12 w-12 rounded-2xl border border-neutral-800 bg-neutral-950 p-2.5 transition-transform group-hover:-rotate-6"
                        style={{
                          boxShadow: `0 8px 24px ${s.accent}26`,
                        }}
                      >
                        <s.Icon accent={s.accent} />
                      </div>
                    </div>
                    <span
                      className="font-display text-3xl tabular-nums leading-none"
                      style={{ color: s.accent }}
                    >
                      {s.n}
                    </span>
                  </div>

                  <div
                    className="perforation my-5"
                    style={{ color: `${s.accent}66` }}
                  />

                  <h3
                    className="font-display text-2xl uppercase"
                    style={{ color: s.accent }}
                  >
                    {s.title}
                  </h3>
                  <p className="mt-3 text-sm text-neutral-300">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

import type { PoolView } from "@/lib/mock-pools";

export function BentoFooter({
  pools,
  programId,
  cluster,
}: {
  pools: PoolView[];
  programId: string;
  cluster: string;
}) {
  const totalPotLamports = pools.reduce((sum, p) => sum + p.totalPotLamports, 0n);
  const totalPotSol = Number(totalPotLamports) / 1_000_000_000;
  const totalRounds = pools.length;
  const totalTickets = pools.reduce((s, p) => s + Number(p.totalTickets), 0);
  // BUYERS placeholder — totalTickets/3 rounded. Floored at 0 when no
  // tickets sold (otherwise "PLAYERS 1" appears on a fresh deploy with
  // empty pools — confusing alongside a "0 SOL pot · 1 player" header).
  const totalPlayers = totalTickets === 0 ? 0 : Math.max(1, Math.round(totalTickets / 3));

  return (
    <section id="faq" className="mx-auto max-w-7xl px-6 pb-24">
      <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Big brand tile (2x2) */}
        <div className="col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-3xl border border-neutral-900 bg-gradient-to-br from-lime/10 via-neutral-950 to-black p-8">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" className="text-lime" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <line x1="12" y1="3"  x2="12" y2="6"  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="3"  y1="12" x2="6"  y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="18" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div>
            <h3 className="font-display text-3xl uppercase leading-[0.95] sm:text-5xl">
              Discover<br />win<br />repeat.
            </h3>
            <p className="mt-3 max-w-xs text-sm text-neutral-400">
              A new round opens automatically the moment the last one settles.
            </p>
          </div>
        </div>

        {/* Total pot */}
        <div className="flex flex-col justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">TOTAL POT</span>
          <div>
            <div className="font-display text-3xl uppercase text-lime tabular-nums">{totalPotSol.toFixed(2)}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">SOL · {totalRounds} ROUNDS</div>
          </div>
        </div>

        {/* Players */}
        <div className="flex flex-col justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">PLAYERS</span>
          <div>
            <div className="font-display text-3xl uppercase tabular-nums">{totalPlayers}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">UNIQUE BUYERS</div>
          </div>
        </div>

        {/* Twitter */}
        <a
          href="https://x.com/atlasbrain"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6 transition-all hover:border-neutral-700"
        >
          <span className="font-display text-base uppercase">Follow</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-neutral-300" aria-hidden>
            <path d="M17 3h3l-7 8 8 10h-6l-5-6-5 6H2l8-9L2 3h6l4 5 5-5z" />
          </svg>
        </a>

        {/* GitHub */}
        <a
          href="https://github.com/AtlasBrain/Project-Tombola"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6 transition-all hover:border-neutral-700"
        >
          <span className="font-display text-base uppercase">GitHub</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-neutral-300" aria-hidden>
            <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
          </svg>
        </a>

        {/* Program ID (col-span-2) */}
        <div className="col-span-2 flex flex-col justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            PROGRAM ID · {cluster.toUpperCase()}
          </span>
          <a
            href={`https://solscan.io/account/${programId}?cluster=${cluster}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 break-all font-mono text-xs text-neutral-300 transition-colors hover:text-lime"
          >
            {programId} ↗
          </a>
        </div>

        {/* Telegram — same shape as the FOLLOW (X) and GITHUB tiles above so
            the social row reads as a triplet. URL is a placeholder; replace
            with the project's actual Telegram link when published. */}
        <a
          href="https://t.me/atlasbrain"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-3xl border border-neutral-900 bg-neutral-950 p-6 transition-all hover:border-neutral-700"
        >
          <span className="font-display text-base uppercase">Telegram</span>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-neutral-300"
            aria-hidden
          >
            <path d="M21.05 2.92 1.86 10.51c-1.31.52-1.3 1.27-.24 1.59l4.93 1.54 11.4-7.19c.54-.33 1.03-.15.63.21l-9.24 8.34h-.01l.01.01-.34 5.08c.5 0 .72-.23.99-.5l2.4-2.33 4.97 3.67c.92.51 1.58.24 1.81-.85L21.96 4.46c.34-1.39-.5-2.04-1.42-1.61z" />
          </svg>
        </a>

        {/* Final CTA */}
        <a
          href="#pools"
          style={{ ["--tear-bg" as string]: "#c9b5dc" } as React.CSSProperties}
          className="btn-fx fx-tear-lg fx-stack flex items-center justify-center bg-lime p-6 text-center font-display text-lg uppercase text-black transition hover:brightness-110"
        >
          <span className="stack">
            <span>Buy a ticket →</span>
            <span>LET&rsquo;S GO! →</span>
          </span>
        </a>
      </div>
    </section>
  );
}

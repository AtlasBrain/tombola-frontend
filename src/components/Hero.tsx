"use client";

import { HeroRing } from "@/components/HeroRing";
import { HeroFloatingIcons } from "@/components/HeroFloatingIcons";
import { smoothScrollToId } from "@/lib/smooth-scroll";

export function Hero() {
  function handleScrollTo(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      smoothScrollToId(id);
    };
  }

  return (
    <section className="relative mx-auto max-w-7xl overflow-hidden px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="bg-dots absolute inset-0 -z-10 opacity-40" />
      <HeroFloatingIcons />

      <div className="relative mx-auto flex aspect-square max-w-[520px] items-center justify-center">
        <HeroRing size={520} />

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] ring-1 ring-white/10">
            <span className="size-1.5 rounded-full bg-emerald-400 pulse-soft" aria-hidden />
            <span className="text-white">LIVE</span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-300">4 POOLS RUNNING</span>
          </div>

          <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl md:text-7xl">
            WHERE SOL <br /> WINS BIG.
          </h1>

          <p className="mx-auto mt-6 max-w-md text-sm text-neutral-400">
            Trustless on-chain raffles. Buy tickets, win the pot, repeat — verifiable randomness via Switchboard.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <a
              href="#how-it-works"
              onClick={handleScrollTo("how-it-works")}
              className="btn-parent group inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold uppercase tracking-[0.12em] btn-inset"
            >
              <span className="btn-stack">
                <span className="stack">
                  <span>LEARN MORE</span>
                  <span>SCROLL ↓</span>
                </span>
              </span>
              <span className="chip flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white">→</span>
            </a>

            <a
              href="#pools"
              onClick={handleScrollTo("pools")}
              className="btn-parent group inline-flex h-11 items-center gap-2 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.12em] btn-tear"
            >
              <span className="btn-stack">
                <span className="stack">
                  <span>BUY A TICKET</span>
                  <span>LET&apos;S GO →</span>
                </span>
              </span>
              <span className="chip flex size-7 items-center justify-center rounded-full bg-black text-white">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

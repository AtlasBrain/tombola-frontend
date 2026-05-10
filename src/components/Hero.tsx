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
      {/* Soft dot grid + warm radial accent — gives the bg some tonal life */}
      <div className="bg-dots absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="absolute left-1/2 top-1/2 -z-10 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,181,220,0.06)_0%,transparent_70%)]" />

      <HeroFloatingIcons />

      <HeroRing />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Status pill */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
          <span className="pulse-soft h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />
          LIVE · 4 POOLS RUNNING
        </span>

        <h1 className="font-display text-5xl uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
          Where SOL<br />wins big
        </h1>

        <p className="mx-auto mt-6 max-w-md text-sm text-neutral-400 sm:text-base">
          Trustless on-chain raffles. Buy tickets, win the pot, repeat — verifiable randomness via Switchboard.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#how-it-works"
            onClick={handleScrollTo("how-it-works")}
            className="btn-fx fx-inset fx-inset-ink flex items-center gap-2 rounded-full bg-white px-2 py-2 pl-5 text-xs font-medium uppercase tracking-widest text-black transition"
          >
            LEARN MORE
            <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-white">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9" /></svg>
            </span>
          </a>
          <a
            href="#pools"
            onClick={handleScrollTo("pools")}
            style={{ ["--tear-bg" as never]: "#c9b5dc" }}
            className="btn-fx fx-tear fx-stack flex items-center gap-2 bg-lime px-2 py-2 pl-5 text-xs font-bold uppercase tracking-widest text-black transition hover:brightness-110"
          >
            <span className="stack"><span>BUY A TICKET</span><span>LET&rsquo;S GO →</span></span>
            <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-lime">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

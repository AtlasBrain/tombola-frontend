"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PROGRAM_ID } from "@tombola/sdk";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  fetchGlobalPrivateStats,
  formatCountCompact,
  formatSolCompact,
  type GlobalPrivateStats,
} from "@/lib/global-private-stats";

const LAVENDER = "#c9b5dc";
const MINT = "#88cfc4";
const YELLOW = "#e8d89e";

interface StepIconProps {
  accent: string;
}

function GearIcon({ accent }: StepIconProps) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <path
        fill={accent}
        d="M20 4l3 4 5-1 1 5 4 3-4 3-1 5-5-1-3 4-3-4-5 1-1-5-4-3 4-3 1-5 5 1z"
      />
      <circle cx="20" cy="20" r="4" fill="#0b0b0d" />
    </svg>
  );
}

function PaperPlaneIcon({ accent }: StepIconProps) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <path fill={accent} d="M5 18l30-12-12 30-4-12-14-6z" />
    </svg>
  );
}

function CoinIcon({ accent }: StepIconProps) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <circle cx="20" cy="20" r="14" fill={accent} />
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fontFamily="Space Mono"
        fontSize="14"
        fontWeight="700"
        fill="#0b0b0d"
      >
        $
      </text>
    </svg>
  );
}

const STEPS: Array<{
  num: number;
  label: string;
  sub: string;
  Icon: (p: StepIconProps) => React.ReactElement;
  accent: string;
}> = [
  {
    num: 1,
    label: "Create",
    sub: "parameter the pool",
    Icon: GearIcon,
    accent: LAVENDER,
  },
  {
    num: 2,
    label: "Share",
    sub: "send invite links",
    Icon: PaperPlaneIcon,
    accent: MINT,
  },
  {
    num: 3,
    label: "Earn",
    sub: "collect creator fee",
    Icon: CoinIcon,
    accent: YELLOW,
  },
];

export function HostRaffleSection() {
  const { connection } = useConnection();
  const [stats, setStats] = useState<GlobalPrivateStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchGlobalPrivateStats({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
        });
        if (!cancelled) setStats(s);
      } catch {
        // Silent — section still renders the rest with "—" placeholders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  // While stats are loading we show "—". Pre-launch state with zero pools
  // also reads as zeros, which is honest.
  const totalSol = stats ? formatSolCompact(stats.totalPotLamports) : "—";
  const creators = stats ? formatCountCompact(stats.creatorsCount) : "—";
  const redeemed = stats ? formatCountCompact(stats.redeemedCount) : "—";

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div
        className="rounded-3xl border border-neutral-800 bg-neutral-950 p-8 sm:p-12"
        style={{
          backgroundImage: `radial-gradient(120% 100% at 50% 0%, ${MINT}20 0%, transparent 60%)`,
        }}
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_auto]">
          {/* LEFT — copy + stats + CTA */}
          <div>
            <span
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: MINT }}
            >
              For creators
            </span>
            <h2 className="mt-3 font-display text-4xl uppercase leading-[0.95] sm:text-6xl">
              Host your own
              <br />
              raffle
            </h2>
            <p className="mt-4 max-w-md text-sm text-neutral-400 sm:text-base">
              Mint invite codes and run a private pool. Codes are bearer
              tokens, single-use on chain.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-neutral-900 pt-6 sm:gap-6 sm:pt-8">
              <Stat value={totalSol} label="SOL minted in private pools" color={LAVENDER} />
              <Stat value={creators} label="Creators hosted a pool" color={MINT} />
              <Stat value={redeemed} label="Invite codes redeemed" color={YELLOW} />
            </div>

            <div className="mt-8">
              <Link
                href="/create"
                style={{ ["--tear-bg" as never]: MINT }}
                className="btn-fx fx-tear inline-flex items-center gap-2 px-5 py-3 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
              >
                Create a private pool
                <span
                  className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px]"
                  style={{ color: MINT }}
                >
                  →
                </span>
              </Link>
            </div>
          </div>

          {/* RIGHT — vertical "How it flows" process column */}
          <aside
            className="rounded-2xl border border-neutral-900 bg-neutral-950/60 p-6 lg:w-[300px]"
            aria-label="How it flows"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              How it flows
            </span>
            <ol className="mt-5 flex flex-col gap-5">
              {STEPS.map((s) => (
                <li key={s.num} className="flex items-center gap-4">
                  <div
                    className="h-12 w-12 shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950 p-2.5"
                    style={{ boxShadow: `0 6px 18px ${s.accent}33` }}
                  >
                    <s.Icon accent={s.accent} />
                  </div>
                  <div>
                    <div
                      className="font-display text-base uppercase"
                      style={{ color: s.accent }}
                    >
                      {s.num}. {s.label}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                      {s.sub}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div>
      <div
        className="font-display text-3xl uppercase tabular-nums sm:text-5xl"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500 sm:text-[10px]">
        {label}
      </div>
    </div>
  );
}

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
const PINK = "#E89999";
const MINT = "#88cfc4";
const YELLOW = "#e8d89e";

// ============= Step icons =============
function GearIcon({ accent }: { accent: string }) {
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

function PaperPlaneIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
      <path fill={accent} d="M5 18l30-12-12 30-4-12-14-6z" />
    </svg>
  );
}

function CoinIcon({ accent }: { accent: string }) {
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

const STEPS = [
  { num: 1, label: "Create", sub: "parameter the pool",   Icon: GearIcon,        accent: LAVENDER },
  { num: 2, label: "Share",  sub: "send invite links",    Icon: PaperPlaneIcon,  accent: MINT },
  { num: 3, label: "Earn",   sub: "collect creator fee",  Icon: CoinIcon,        accent: YELLOW },
] as const;

// ============= Live activity (mocked rows for now; can be wired to a real
// recent-activity stream later via getSignaturesForAddress on the program) =
const ACTIVITY = [
  { c: MINT,     l: "Code redeemed",     w: "aBcD9zXq7mPLk2f4", t: "XyZ9kQrM5n8qP1vR", extra: "pool 2mrDTLyc…g8XR" },
  { c: LAVENDER, l: "+0.05 SOL minted",  w: "7xZQrm5n8qPaBcD9", t: "d8qPaBcD9zXq2L7m", extra: "ticket #142 · price 0.01 SOL" },
  { c: YELLOW,   l: "Pool resolved",     w: "winner 9pQr8L2k7xMn", t: "2L7mWvBn3jKpQ4rS", extra: "pot 0.85 SOL · 47 tickets" },
  { c: PINK,     l: "New pool",          w: "creator FCha8L9qWvBn", t: "WWe4Mx2nJk5RpQrA", extra: "whitelist · 100 codes · fee 2.5%" },
  { c: MINT,     l: "Code redeemed",     w: "gM5n8qP1vRxL2k4f", t: "8qP1vRxL2k4f9zXq", extra: "pool 7yK4Lp2m…3vNb" },
  { c: LAVENDER, l: "+0.10 SOL minted",  w: "4uK0Lp2m9rXk1nB7", t: "1nB7Wv8DqT3jKpQ4", extra: "ticket #287 · price 0.05 SOL" },
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
        // section still renders with "—" placeholders
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const totalSol = stats ? formatSolCompact(stats.totalPotLamports) : "—";
  const creators = stats ? formatCountCompact(stats.creatorsCount) : "—";
  const redeemed = stats ? formatCountCompact(stats.redeemedCount) : "—";

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div
        className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-8 sm:p-12"
        style={{
          backgroundImage: `radial-gradient(120% 100% at 50% 0%, ${MINT}1f 0%, transparent 60%)`,
        }}
      >
        <FloatingIcons />

        <div className="relative z-10">
          <div className="grid items-stretch gap-10 lg:grid-cols-[1fr_400px]">
            {/* LEFT — copy + stats */}
            <div className="flex flex-col">
              <ForCreatorBadge />
              <h2 className="mt-3 font-display text-4xl uppercase leading-[0.95] sm:text-6xl">
                Host your own
                <br />
                raffle
              </h2>
              <p className="mt-4 max-w-md text-sm text-neutral-400 sm:text-base">
                Mint invite codes and run a private pool. Codes are bearer
                tokens, single-use on chain.
              </p>

              <div className="mt-auto grid grid-cols-3 gap-12 pt-8">
                <Stat value={totalSol} label="SOL minted in private pools" color={LAVENDER} />
                <Stat value={creators} label="Creators hosted a pool" color={MINT} />
                <Stat value={redeemed} label="Invite codes redeemed" color={YELLOW} />
              </div>
            </div>

            {/* RIGHT — How it flows + CTA */}
            <FlowColumn />
          </div>

          <ActivityFeed />
        </div>
      </div>
    </section>
  );
}

// =============== Decorative pieces ===============

function ForCreatorBadge() {
  // Decorative pill; not a link. Pulsing mint dot for the brand cue.
  return (
    <span
      role="status"
      aria-label="For creators"
      className="inline-flex select-none items-center gap-2 self-start rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300"
    >
      <span
        className="pulse-soft h-1.5 w-1.5 rounded-full"
        style={{ background: MINT }}
        aria-hidden
      />
      For creator
    </span>
  );
}

function FlowColumn() {
  return (
    <aside className="flex flex-col rounded-2xl border border-neutral-900 bg-neutral-950/60 p-7">
      {/* Highlighted "How it flows" header — lavender so it doesn't compete
          with the mint accents elsewhere on the section. The accent line
          fills the rest of the row. */}
      <div>
        <div className="flex items-center gap-3">
          <span
            className="font-display text-lg uppercase"
            style={{ color: LAVENDER }}
          >
            How it flows
          </span>
          <span
            className="h-px flex-1"
            style={{ background: LAVENDER, opacity: 0.35 }}
          />
        </div>
        <div
          className="mt-1 font-mono text-[10px] uppercase tracking-widest"
          style={{ color: LAVENDER, opacity: 0.6 }}
        >
          creator side · 3 steps
        </div>
      </div>

      {/* Vertical dashed connector + traveling glow-dot moving Create →
          Share → Earn every 4.5s. Sits at left:32px (the icon center). */}
      <div className="relative mt-6">
        <div
          aria-hidden
          className="absolute left-[32px] top-8 bottom-8 w-px"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(255,255,255,0.18) 4px, transparent 4px)",
            backgroundSize: "1px 10px",
            backgroundRepeat: "repeat-y",
          }}
        />
        <div
          aria-hidden
          className="absolute left-[29px] top-8 bottom-8 w-px overflow-hidden"
        >
          <span
            className="traveler-v absolute -left-[2px] h-2 w-2 rounded-full"
            style={{
              background: MINT,
              boxShadow: "0 0 12px 2px rgba(136,207,196,0.7)",
              top: "0",
            }}
          />
        </div>

        <ol className="relative flex flex-col gap-7">
          {STEPS.map((s) => (
            <li key={s.num} className="relative flex items-center gap-5">
              <div
                className="relative z-10 h-16 w-16 shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                style={{ boxShadow: `0 8px 24px ${s.accent}40` }}
              >
                <s.Icon accent={s.accent} />
              </div>
              <div>
                <div
                  className="font-display text-2xl uppercase"
                  style={{ color: s.accent }}
                >
                  {s.num}. {s.label}
                </div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  {s.sub}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* CTA — lottery-ticket button at the bottom, centered. mt-auto pushes
          it down so it vertically aligns with the stats row in the LEFT
          column. */}
      <div className="mt-auto flex justify-center pt-8">
        <CreatePoolTicketButton />
      </div>
    </aside>
  );
}

/**
 * Lottery-ticket-style CTA: tear-corner shape (.fx-tear-lg from globals.css),
 * pink fill, vertical perforation strip between the label and the arrow chip,
 * with a tightened-distance shimmer sweep + pulsing pink halo.
 */
function CreatePoolTicketButton() {
  return (
    <Link
      href="/create"
      style={{ ["--tear-bg" as never]: PINK }}
      // .cta-halo is applied here (not on a wrapper) so its filter:
      // drop-shadow renders the glow against the actual rendered alpha
      // of the tear-corner pseudo, not a rectangular bounding box.
      className="cta-halo btn-fx fx-tear-lg ticket-shimmer-mask relative inline-flex items-center gap-3.5 px-5 py-3.5 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
    >
      <span className="relative z-10">Create a private pool</span>
      <span
        aria-hidden
        className="relative z-10 self-stretch w-px"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.6) 4px, transparent 4px)",
          backgroundSize: "1px 8px",
          backgroundRepeat: "repeat-y",
        }}
      />
      <span
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px]"
        style={{ color: PINK }}
      >
        →
      </span>
    </Link>
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
        className="font-display uppercase tabular-nums"
        style={{
          color,
          fontSize: "clamp(40px, 6vw, 80px)",
          lineHeight: 0.9,
        }}
      >
        {value}
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function ActivityFeed() {
  const items = [...ACTIVITY, ...ACTIVITY]; // double for seamless loop
  return (
    <div className="mt-4 rounded-2xl border border-neutral-900 bg-neutral-950/80 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Live activity
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: MINT }}
        >
          <span
            className="pulse-soft mr-1 inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: MINT }}
            aria-hidden
          />
          Streaming
        </span>
      </div>
      <div className="relative h-28 overflow-hidden">
        <div className="feed-track flex flex-col gap-2.5">
          {items.map((x, i) => (
            <div
              key={`${x.l}-${i}`}
              className="flex items-center gap-3 font-mono text-xs"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: x.c }}
              />
              <span className="shrink-0" style={{ color: x.c }}>
                {x.l}
              </span>
              <span className="text-neutral-500">·</span>
              <span className="truncate text-neutral-300">
                {x.w}…{x.t}
              </span>
              <span className="text-neutral-500">·</span>
              <span className="ml-auto hidden truncate text-neutral-400 lg:inline">
                {x.extra}
              </span>
              <span className="shrink-0 text-neutral-600">just now</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 7 floating decorative icons. Positions chosen to sit in empty zones
 * (top-mid, mid-right gutter between description and steps panel, gap
 * between description and stats on the left). Hidden below md so they
 * don't fight mobile content. z-index 0; section content wraps in
 * .relative.z-10 to stay above.
 */
function FloatingIcons() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden md:block"
    >
      {/* top-mid sparkle */}
      <div
        className="float-r3 absolute"
        style={{ top: "4%", left: "50%", height: 36, width: 36 }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <path
            fill={YELLOW}
            d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z"
          />
        </svg>
      </div>

      {/* coin right of headline */}
      <div
        className="float-r4 absolute"
        style={{ top: "16%", left: "54%", height: 56, width: 56 }}
      >
        <div
          className="h-full w-full rounded-full border border-neutral-800 bg-neutral-950 p-2.5"
          style={{ boxShadow: "0 10px 26px rgba(232,216,158,0.35)" }}
        >
          <svg viewBox="0 0 40 40" className="h-full w-full">
            <circle cx="20" cy="20" r="14" fill={YELLOW} />
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
        </div>
      </div>

      {/* pink key (mid-right between description and stats) */}
      <div
        className="float-r2 absolute"
        style={{ top: "32%", left: "56%", height: 56, width: 56 }}
      >
        <div
          className="h-full w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-2.5"
          style={{ boxShadow: "0 8px 22px rgba(232,165,192,0.3)" }}
        >
          <svg viewBox="0 0 40 40" className="h-full w-full">
            <circle
              cx="13"
              cy="20"
              r="7"
              fill="none"
              stroke={PINK}
              strokeWidth="2.5"
            />
            <circle cx="13" cy="20" r="2.2" fill={PINK} />
            <line x1="20" y1="20" x2="34" y2="20" stroke={PINK} strokeWidth="2.5" />
            <line x1="29" y1="20" x2="29" y2="26" stroke={PINK} strokeWidth="2.5" />
          </svg>
        </div>
      </div>

      {/* lavender ticket (left, between description and stats) */}
      <div
        className="float-r6 absolute"
        style={{ top: "38%", left: "8%", height: 42, width: 42 }}
      >
        <div
          className="h-full w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-2"
          style={{ boxShadow: "0 6px 18px rgba(201,181,220,0.3)" }}
        >
          <svg viewBox="0 0 40 40" className="h-full w-full">
            <path
              fill={LAVENDER}
              d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z"
            />
            <line
              x1="14"
              y1="14"
              x2="14"
              y2="34"
              stroke="#0b0b0d"
              strokeWidth="2"
              strokeDasharray="2 2"
            />
          </svg>
        </div>
      </div>

      {/* pink dice (left-mid, fills gap) */}
      <div
        className="float-r1 absolute"
        style={{ top: "42%", left: "30%", height: 36, width: 36 }}
      >
        <div
          className="h-full w-full rounded-xl border border-neutral-800 bg-neutral-950 p-1.5"
          style={{ boxShadow: "0 6px 18px rgba(232,153,153,0.3)" }}
        >
          <svg viewBox="0 0 40 40" className="h-full w-full">
            <rect x="6" y="6" width="28" height="28" rx="6" fill={PINK} />
            <circle cx="14" cy="14" r="2.4" fill="#0b0b0d" />
            <circle cx="26" cy="26" r="2.4" fill="#0b0b0d" />
            <circle cx="20" cy="20" r="2.4" fill="#0b0b0d" />
          </svg>
        </div>
      </div>

      {/* small lavender sparkle (between description and stats, lower) */}
      <div
        className="float-r5 absolute"
        style={{ top: "52%", left: "64%", height: 28, width: 28 }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <path
            fill={LAVENDER}
            d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z"
          />
        </svg>
      </div>

      {/* top-right ticket (small, above the steps panel header) */}
      <div
        className="float-r1 absolute"
        style={{ top: "1%", right: "38%", height: 40, width: 40, opacity: 0.85 }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <path
            fill={LAVENDER}
            d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z"
          />
          <line
            x1="14"
            y1="14"
            x2="14"
            y2="34"
            stroke="#0b0b0d"
            strokeWidth="2"
            strokeDasharray="2 2"
          />
        </svg>
      </div>
    </div>
  );
}

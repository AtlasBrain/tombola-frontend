"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PROGRAM_ID } from "@tombola/sdk";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol } from "@/lib/format";
import {
  computeLifetimeStats,
  filterCounts,
  filterPools,
  findMyParticipations,
  iterateParticipantCounts,
  type BuyerFilter,
  type PoolMembership,
} from "@/lib/buyer-pools";

// Brand palette tokens — match globals.css :root accents
const ACCENT_LAVENDER = "#c9b5dc";
const ACCENT_PINK = "#E89999";
const ACCENT_MINT = "#88cfc4";
const ACCENT_YELLOW = "#e8d89e";
// Money-tone replacements (Q3b: brand instead of emerald/rose)
const MONEY_POS = ACCENT_MINT;
const MONEY_NEG = ACCENT_PINK;

const POOL_KIND_LABELS: Record<number, string> = {
  0: "Weekly",
  1: "Biweekly",
  2: "Triweekly",
  3: "Monthly",
};

/** Per-pool accent lookup (Q1a). Public pools color-coded by cadence to
 *  match landing-page PoolCards; private pools take mint (matches the
 *  /pool/private design). */
function accentFor(p: PoolMembership): string {
  if (p.kind === "private") return ACCENT_MINT;
  switch (p.publicPoolType) {
    case 0:
      return ACCENT_LAVENDER;
    case 1:
      return ACCENT_PINK;
    case 2:
      return ACCENT_MINT;
    case 3:
      return ACCENT_YELLOW;
    default:
      return ACCENT_LAVENDER;
  }
}

function poolHref(p: PoolMembership): string {
  if (
    p.kind === "public" &&
    p.publicPoolType !== undefined &&
    p.publicRound !== undefined
  ) {
    const slug = (POOL_KIND_LABELS[p.publicPoolType] ?? "weekly").toLowerCase();
    return `/pool/${slug}/${p.publicRound.toString()}`;
  }
  return `/pool/private/${p.poolAddress}`;
}

function poolDisplayName(p: PoolMembership): string {
  if (p.kind === "public" && p.publicPoolType !== undefined) {
    return `${POOL_KIND_LABELS[p.publicPoolType] ?? "Public"} #${p.publicRound?.toString() ?? "?"}`;
  }
  return `Private`;
}

function shortAddr(addr: string): string {
  return addr.length <= 10 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function pctStr(my: bigint, total: bigint): string {
  if (total === 0n) return "0%";
  const pctTimes100 = Number((my * 10_000n) / total) / 100;
  return `${pctTimes100.toFixed(pctTimes100 < 10 ? 2 : 1)}%`;
}

function statePill(
  state: PoolMembership["state"],
  accent: string,
): { label: string; style: React.CSSProperties; cls: string } {
  if (state === "Open") {
    return {
      label: "▲ OPEN",
      style: {
        borderColor: `${accent}4d`,
        background: `${accent}1a`,
        color: accent,
      },
      cls: "border",
    };
  }
  if (state === "AwaitingVrf") {
    return {
      label: "◷ DRAWING",
      style: {},
      cls: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
    };
  }
  return {
    label: "✓ RESOLVED",
    style: {},
    cls: "border border-neutral-800 bg-neutral-900/50 text-neutral-400",
  };
}

export function BuyerDashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<PoolMembership[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<BuyerFilter>("all");

  useEffect(() => {
    if (!publicKey) {
      setPools(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const found = await findMyParticipations({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          walletAddress: publicKey.toBase58(),
        });
        if (cancelled) return;
        setPools(found);

        // Trickle in participant counts. The page is usable while these
        // resolve — each pool just shows "…" until its count lands.
        for await (const { poolAddress, count } of iterateParticipantCounts({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          poolAddresses: found.map((p) => p.poolAddress),
        })) {
          if (cancelled) return;
          setPools((prev) =>
            prev
              ? prev.map((p) =>
                  p.poolAddress === poolAddress
                    ? { ...p, participantsCount: count }
                    : p,
                )
              : prev,
          );
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  const stats = useMemo(
    () => (pools ? computeLifetimeStats(pools) : null),
    [pools],
  );
  const counts = useMemo(
    () => (pools ? filterCounts(pools) : null),
    [pools],
  );
  const visible = useMemo(
    () => (pools ? filterPools(pools, filter) : null),
    [pools, filter],
  );

  if (!publicKey) {
    return (
      <p className="text-sm text-neutral-400">
        Connect your wallet to see your tickets.
      </p>
    );
  }
  if (err) {
    return (
      <p className="text-sm text-rose-400" role="alert">
        Couldn&apos;t load your activity: {err}
      </p>
    );
  }
  if (pools === null) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  if (pools.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center">
        <p className="font-display text-2xl uppercase">No tickets yet</p>
        <p className="mt-2 text-sm text-neutral-500">
          You haven&apos;t bought into any pool from this wallet.
        </p>
        <Link
          href="/#pools"
          style={{ ["--tear-bg" as never]: ACCENT_LAVENDER }}
          className="btn-fx fx-tear mt-6 inline-flex items-center gap-2 px-5 py-3 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
        >
          BROWSE PUBLIC POOLS
          <span className="chip-flip flex h-6 w-6 items-center justify-center rounded-full bg-black text-[10px] text-white">
            →
          </span>
        </Link>
      </div>
    );
  }

  const live = visible!.filter((p) => p.state !== "Resolved");
  const history = visible!.filter((p) => p.state === "Resolved");

  return (
    <div className="flex flex-col gap-8">
      {stats && <LifetimeStats stats={stats} />}
      {counts && (
        <FilterChips counts={counts} filter={filter} onChange={setFilter} />
      )}
      {live.length > 0 && (
        <PoolsSection
          title="Live"
          pools={live}
          rpcUrl={connection.rpcEndpoint}
          myAddress={publicKey.toBase58()}
        />
      )}
      {history.length > 0 && (
        <PoolsSection
          title="History"
          pools={history}
          rpcUrl={connection.rpcEndpoint}
          myAddress={publicKey.toBase58()}
        />
      )}
      {live.length === 0 && history.length === 0 && (
        <p className="text-sm text-neutral-500">
          Nothing matches this filter.
        </p>
      )}
    </div>
  );
}

function LifetimeStats({
  stats,
}: {
  stats: ReturnType<typeof computeLifetimeStats>;
}) {
  const pnlSign =
    stats.netPnLLamports > 0n ? "+" : stats.netPnLLamports < 0n ? "−" : "";
  const pnlAbs =
    stats.netPnLLamports < 0n ? -stats.netPnLLamports : stats.netPnLLamports;
  const pnlColor =
    stats.netPnLLamports > 0n
      ? MONEY_POS
      : stats.netPnLLamports < 0n
        ? MONEY_NEG
        : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Tickets bought"
        value={stats.totalTickets.toLocaleString()}
        sub={`${stats.poolsCount} pool${stats.poolsCount === 1 ? "" : "s"} total`}
      />
      <Stat
        label="Spent"
        value={formatSol(stats.totalSpentLamports)}
        sub={`across ${stats.poolsCount} pool${stats.poolsCount === 1 ? "" : "s"}`}
      />
      <Stat
        label="Won"
        value={formatSol(stats.totalWonLamports)}
        sub={`${stats.wonCount} of ${stats.resolvedCount} resolved`}
        valueColor={MONEY_POS}
      />
      <Stat
        label="Net P&L"
        value={`${pnlSign}${formatSol(pnlAbs)}`}
        sub={
          stats.resolvedCount === 0
            ? "no resolved pools yet"
            : "won − spent on resolved"
        }
        valueColor={pnlColor}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className="mt-1 font-display text-2xl uppercase tabular-nums"
        style={{ color: valueColor ?? "#f5f5f5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function FilterChips({
  counts,
  filter,
  onChange,
}: {
  counts: Record<BuyerFilter, number>;
  filter: BuyerFilter;
  onChange: (f: BuyerFilter) => void;
}) {
  const chips: Array<{ key: BuyerFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "live", label: "Live" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const active = filter === c.key;
        const activeStyle = active
          ? {
              borderColor: ACCENT_LAVENDER,
              background: `${ACCENT_LAVENDER}26`,
              color: ACCENT_LAVENDER,
            }
          : undefined;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            style={activeStyle}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition ${
              active
                ? ""
                : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            }`}
          >
            {c.label}{" "}
            <span className="ml-1 text-neutral-500 tabular-nums">
              ({counts[c.key]})
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PoolsSection({
  title,
  pools,
  rpcUrl,
  myAddress,
}: {
  title: string;
  pools: PoolMembership[];
  rpcUrl: string;
  myAddress: string;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-display text-2xl uppercase">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 tabular-nums">
          {pools.length} pool{pools.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {pools.map((p) => (
          <PoolRow
            key={p.poolAddress}
            pool={p}
            rpcUrl={rpcUrl}
            myAddress={myAddress}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Compact accent-strip row (Q2b). Visual structure:
 *   [accent left rule]  Pool name + status pill        [Pot in display font]
 *                       Pool address ↗ + winner ↗
 *                       ─────────── 4-col metrics grid ──────────────
 *
 * When iWon: row uses an accent-tinted gradient + glow, "Pot" label
 * becomes "Paid to you" in mint. Hover bumps brightness on the accent
 * rule (subtle .btn-fx-style polish).
 */
function PoolRow({
  pool,
  rpcUrl,
  myAddress,
}: {
  pool: PoolMembership;
  rpcUrl: string;
  myAddress: string;
}) {
  const accent = accentFor(pool);
  const pill = statePill(pool.state, accent);

  const baseStyle: React.CSSProperties = pool.iWon
    ? {
        background: `linear-gradient(135deg, ${MONEY_POS}26, ${MONEY_POS}0d 60%, transparent)`,
        borderColor: `${MONEY_POS}80`,
        boxShadow: `0 0 0 1px ${MONEY_POS}33, 0 8px 30px ${MONEY_POS}26`,
      }
    : {
        backgroundImage: `linear-gradient(90deg, ${accent}10 0%, transparent 30%)`,
        borderColor: "rgb(38 38 38)",
      };

  const ruleColor = pool.iWon ? MONEY_POS : accent;
  const potColor = pool.iWon ? MONEY_POS : accent;

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border bg-neutral-900/40 p-5 transition hover:-translate-y-px"
      style={baseStyle}
    >
      {/* Accent rule on the left edge — the "strip" of an accent-strip row */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
        style={{ background: ruleColor }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={poolHref(pool)}
              className="font-display text-xl uppercase transition hover:brightness-125"
              style={{ color: pool.iWon ? MONEY_POS : "#f5f5f5" }}
            >
              {poolDisplayName(pool)}
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${pill.cls}`}
              style={pill.style}
            >
              {pill.label}
            </span>
            {pool.iWon && (
              <span
                className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: `${MONEY_POS}40`,
                  color: MONEY_POS,
                }}
              >
                🏆 You won
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <a
              href={explorerAddressUrl(pool.poolAddress, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              {shortAddr(pool.poolAddress)} ↗
            </a>
            {pool.state === "Resolved" && pool.winner && !pool.iWon && (
              <>
                {" · winner "}
                <a
                  href={explorerAddressUrl(pool.winner, rpcUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-neutral-300"
                >
                  {shortAddr(pool.winner)} ↗
                </a>
              </>
            )}
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {pool.iWon ? "Paid to you" : "Pot"}
          </div>
          <div
            className="font-display text-3xl uppercase leading-none tabular-nums"
            style={{ color: potColor }}
          >
            {formatSol(pool.totalPotLamports)}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 pl-2 text-sm sm:grid-cols-4">
        <Metric
          label="Your tickets"
          value={pool.myTickets.toString()}
          sub={`${formatSol(pool.mySpentLamports)} spent`}
        />
        <Metric
          label="Total tickets"
          value={pool.totalTickets.toString()}
          sub={`@ ${formatSol(pool.ticketPriceLamports)} ea.`}
        />
        <Metric
          label="Your odds"
          value={pctStr(pool.myTickets, pool.totalTickets)}
          sub={
            pool.totalTickets === 0n
              ? ""
              : `${pool.myTickets.toString()} of ${pool.totalTickets.toString()}`
          }
        />
        <Metric
          label="Participants"
          value={
            pool.participantsCount === null
              ? "…"
              : pool.participantsCount.toString()
          }
          sub="distinct buyers"
        />
      </dl>

      {pool.state === "Resolved" && pool.iWon && pool.winningTicketId !== null && (
        <p
          className="mt-3 pl-2 font-mono text-[10px] uppercase tracking-widest"
          style={{ color: MONEY_POS }}
        >
          Winning ticket #{pool.winningTicketId.toString()} — paid into{" "}
          <a
            href={explorerAddressUrl(myAddress, rpcUrl)}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            your wallet ↗
          </a>
        </p>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 font-display text-lg uppercase tabular-nums text-neutral-100">
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[10px] tabular-nums text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

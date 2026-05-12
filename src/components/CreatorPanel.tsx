"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PROGRAM_ID } from "@tombola/sdk";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, shortAddress} from "@/lib/format";
import {
  fetchCreatorStats,
  type CreatorPoolSummary,
  type CreatorStats,
} from "@/lib/creator-stats";

const LAVENDER = "#c9b5dc";
const MINT = "#88cfc4";
const YELLOW = "#e8d89e";
const PINK = "#E89999";

function durationLabel(openSec: number, closeSec: number): string {
  const secs = Math.max(0, closeSec - openSec);
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(secs / 60)}m`;
}

function reputationBadge(stats: CreatorStats): {
  label: string;
  color: string;
  desc: string;
} {
  if (stats.poolsCount === 0) {
    return {
      label: "No history yet",
      color: "#737373",
      desc: "This wallet hasn't created any pools.",
    };
  }
  if (stats.resolvedCount === 0) {
    return {
      label: "New creator",
      color: LAVENDER,
      desc: "Pools running but none resolved yet.",
    };
  }
  if (stats.payoutRate === 100) {
    return {
      label: "Verified · 100% payout",
      color: MINT,
      desc: `Every one of ${stats.resolvedCount} resolved pool${stats.resolvedCount === 1 ? "" : "s"} paid out cleanly.`,
    };
  }
  if (stats.payoutRate >= 80) {
    return {
      label: "Active",
      color: YELLOW,
      desc: `${stats.payoutRate.toFixed(0)}% of resolved pools paid out (${stats.resolvedCount - stats.paidOutCount} voided).`,
    };
  }
  return {
    label: "Mixed",
    color: PINK,
    desc: `${stats.payoutRate.toFixed(0)}% payout rate · check pool history below.`,
  };
}

/** Embeddable "this wallet's creator activity" panel. Used as a tab
 *  inside /u/[handle] so we don't have to maintain a separate page.
 *  The legacy /creator/[address] route now redirects to
 *  /u/<address>?tab=creator. */
export function CreatorPanel({ address }: { address: string }) {
  const { connection } = useConnection();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchCreatorStats({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          creatorAddress: address,
        });
        if (!cancelled) setStats(s);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load creator");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, address]);

  if (err) {
    return <p className="mt-6 text-sm text-rose-400">{err}</p>;
  }

  if (!stats) {
    return (
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
        Loading creator stats…
      </p>
    );
  }

  const badge = reputationBadge(stats);
  const rpcUrl = connection.rpcEndpoint;

  return (
    <div className="mt-6">
      <section className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:rounded-3xl sm:p-10">
          {/* Reputation badge — identity already shown above by the
              parent ProfileCard, so no duplicate heading here. */}
          <div
            className="inline-flex items-start gap-3 rounded-xl border p-4"
            style={{
              borderColor: `${badge.color}66`,
              background: `${badge.color}10`,
            }}
          >
            <div>
              <div
                className="font-display text-lg uppercase"
                style={{ color: badge.color }}
              >
                {badge.label}
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                {badge.desc}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <Stat label="Pools" value={stats.poolsCount.toString()} sub={`${stats.liveCount} live`} />
            <Stat
              label="Payout rate"
              value={
                stats.resolvedCount > 0
                  ? `${stats.payoutRate.toFixed(0)}%`
                  : "—"
              }
              sub={`${stats.paidOutCount} of ${stats.resolvedCount} resolved`}
              color={badge.color}
            />
            <Stat
              label="Fees earned"
              value={formatSol(stats.feesEarnedLamports)}
              sub={
                stats.feesPendingLamports > 0n
                  ? `+ ${formatSol(stats.feesPendingLamports)} pending`
                  : "all settled"
              }
              color={MINT}
            />
            <Stat
              label="Tickets sold"
              value={stats.totalTicketsSold.toLocaleString()}
              sub={`${formatSol(stats.totalPotLamports)} total pot`}
            />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl uppercase">Pools</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {stats.poolsCount} total · newest first
            </span>
          </div>
          {stats.poolsCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center text-sm text-neutral-500">
              This creator hasn&apos;t created any private pools yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.pools.map((p) => (
                <PoolCard key={p.poolAddress} pool={p} rpcUrl={rpcUrl} />
              ))}
            </div>
          )}
        </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 sm:text-[10px]">
        {label}
      </div>
      <div
        className="mt-1 font-display text-xl uppercase tabular-nums sm:text-2xl"
        style={{ color: color ?? "#f5f5f5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500 sm:text-[10px]">
          {sub}
        </div>
      )}
    </div>
  );
}

function PoolCard({
  pool,
  rpcUrl,
}: {
  pool: CreatorPoolSummary;
  rpcUrl: string;
}) {
  const stateMeta =
    pool.state === 2
      ? pool.paidOut
        ? { label: "✓ Resolved", color: MINT }
        : { label: "Voided", color: "#737373" }
      : pool.state === 1
        ? { label: "Drawing", color: YELLOW }
        : pool.closeTimeUnix * 1000 <= Date.now()
          ? { label: "Closed", color: YELLOW }
          : { label: "Open", color: MINT };

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5"
      style={{
        backgroundImage: `linear-gradient(90deg, ${stateMeta.color}10 0%, transparent 30%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: stateMeta.color }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <Link
            href={`/pool/private/${pool.poolAddress}`}
            className="font-display text-lg uppercase transition hover:brightness-125"
          >
            {shortAddress(pool.poolAddress)}
          </Link>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <a
              href={explorerAddressUrl(pool.poolAddress, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              {shortAddress(pool.poolAddress)} ↗
            </a>{" "}
            · {pool.accessMode === "Whitelist" ? "Whitelist" : "1 code/ticket"}{" "}
            · {(pool.creatorFeeBps / 100).toFixed(1)}% fee ·{" "}
            {durationLabel(pool.openTimeUnix, pool.closeTimeUnix)} duration
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
          style={{
            borderColor: `${stateMeta.color}66`,
            background: `${stateMeta.color}1a`,
            color: stateMeta.color,
          }}
        >
          {stateMeta.label}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 pl-2 text-sm sm:grid-cols-4">
        <Metric label="Tickets" value={pool.totalTickets.toString()} />
        <Metric label="Pot" value={formatSol(pool.totalPotLamports)} />
        <Metric
          label="Fee earned"
          value={pool.paidOut ? formatSol(pool.feeEarnedLamports) : "—"}
          sub={
            pool.paidOut
              ? "paid at settle"
              : pool.state === 2
                ? "voided"
                : "pending"
          }
          color={pool.paidOut ? MINT : undefined}
        />
        <Metric
          label="Ticket price"
          value={formatSol(pool.ticketPriceLamports)}
        />
      </dl>
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className="mt-0.5 font-display text-base uppercase tabular-nums sm:text-lg"
        style={{ color: color ?? "#f5f5f5" }}
      >
        {value}
      </div>
      {sub && (
        <div className="font-mono text-[9px] tabular-nums text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

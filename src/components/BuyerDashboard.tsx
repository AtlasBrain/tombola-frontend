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

const POOL_KIND_LABELS: Record<number, string> = {
  0: "Weekly",
  1: "Biweekly",
  2: "Triweekly",
  3: "Monthly",
};

function poolHref(p: PoolMembership): string {
  if (p.kind === "public" && p.publicPoolType !== undefined && p.publicRound !== undefined) {
    const slug = (POOL_KIND_LABELS[p.publicPoolType] ?? "weekly").toLowerCase();
    return `/pool/${slug}/${p.publicRound.toString()}`;
  }
  return `/pool/private/${p.poolAddress}`;
}

function poolDisplayName(p: PoolMembership): string {
  if (p.kind === "public" && p.publicPoolType !== undefined) {
    return `${POOL_KIND_LABELS[p.publicPoolType] ?? "Public"} #${p.publicRound?.toString() ?? "?"}`;
  }
  return `Private · ${p.poolAddress.slice(0, 6)}…${p.poolAddress.slice(-4)}`;
}

function shortAddr(addr: string): string {
  return addr.length <= 10 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function pctStr(my: bigint, total: bigint): string {
  if (total === 0n) return "0%";
  const pctTimes100 = Number((my * 10_000n) / total) / 100;
  return `${pctTimes100.toFixed(pctTimes100 < 10 ? 2 : 1)}%`;
}

const STATUS_BADGE: Record<
  PoolMembership["state"],
  { label: string; cls: string }
> = {
  Open: {
    label: "Open",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  },
  AwaitingVrf: {
    label: "Drawing",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  },
  Resolved: {
    label: "Resolved",
    cls: "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20",
  },
};

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
      <p className="text-sm text-red-400" role="alert">
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
          href="/"
          className="mt-6 inline-flex rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Browse public pools →
        </Link>
      </div>
    );
  }

  // Split visible into Live and History sections so resolved pools live
  // below their still-running counterparts.
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
  const pnlSign = stats.netPnLLamports > 0n ? "+" : stats.netPnLLamports < 0n ? "−" : "";
  const pnlAbs = stats.netPnLLamports < 0n ? -stats.netPnLLamports : stats.netPnLLamports;
  const pnlClass =
    stats.netPnLLamports > 0n
      ? "text-emerald-400"
      : stats.netPnLLamports < 0n
        ? "text-rose-400"
        : "text-neutral-400";

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
        accent="emerald"
      />
      <Stat
        label="Net P&L"
        value={`${pnlSign}${formatSol(pnlAbs)}`}
        sub={
          stats.resolvedCount === 0
            ? "no resolved pools yet"
            : "won − spent on resolved"
        }
        valueClass={pnlClass}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald";
  valueClass?: string;
}) {
  const cls =
    valueClass ??
    (accent === "emerald" ? "text-emerald-400" : "text-neutral-100");
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 font-display text-2xl uppercase tabular-nums ${cls}`}>
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
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition ${
              active
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
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

function PoolRow({
  pool,
  rpcUrl,
  myAddress,
}: {
  pool: PoolMembership;
  rpcUrl: string;
  myAddress: string;
}) {
  const badge = STATUS_BADGE[pool.state];
  const youWonBg = pool.iWon
    ? {
        background:
          "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.05) 60%, transparent)",
        borderColor: "rgba(16,185,129,0.5)",
        boxShadow: "0 0 0 1px rgba(16,185,129,0.2), 0 8px 30px rgba(16,185,129,0.15)",
      }
    : undefined;

  return (
    <article
      className={`rounded-2xl border p-5 transition ${
        pool.iWon
          ? ""
          : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-700"
      }`}
      style={youWonBg}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={poolHref(pool)}
              className="font-display text-xl uppercase hover:text-white"
            >
              {poolDisplayName(pool)}
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badge.cls}`}
            >
              {badge.label}
            </span>
            {pool.iWon && (
              <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
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

        {pool.iWon ? (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">
              Paid to you
            </div>
            <div className="font-display text-2xl uppercase tabular-nums text-emerald-300">
              {formatSol(pool.totalPotLamports)}
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Pot
            </div>
            <div className="font-display text-2xl uppercase tabular-nums text-neutral-100">
              {formatSol(pool.totalPotLamports)}
            </div>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
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
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
          Winning ticket #{pool.winningTicketId.toString()} — paid into{" "}
          <a
            href={explorerAddressUrl(myAddress, rpcUrl)}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            your wallet
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

"use client";

// /admin — executive overview.
//
// Renders KPIs + live pool roster from /api/admin/overview, which is
// admin-gated. Polls every 30s so the dashboard stays fresh without
// requiring a refresh.
//
// Visual reference: docs/design/mockups/admin-1-executive.html.

import { useEffect, useState } from "react";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";
import { formatSol, shortAddress } from "@/lib/format";
import { Countdown } from "@/components/Countdown";

interface OverviewKpis {
  lifetimeVolumeLamports: string;
  lifetimeFeesLamports: string;
  lifetimePayoutsLamports: string;
  pendingPayoutsLamports: string;
  totalTickets: string;
  pools: {
    public: { open: number; drawing: number; resolved: number };
    private: { open: number; drawing: number; resolved: number };
  };
  totalUsers: number;
  treasury: {
    address: string;
    balanceLamports: string;
    isMultisig: boolean;
  };
  generatedAt: number;
}

interface LivePoolRow {
  address: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  state: 0 | 1 | 2;
  totalTickets: string;
  totalPotLamports: string;
  closeTimeUnix: number;
  ticketPriceLamports: string;
}

interface TimeSeriesPayload {
  newUsersByDay: Array<{ day: string; count: number }>;
  dau: number;
  wau: number;
  mau: number;
  newUsers7d: number;
  newUsers30d: number;
  generatedAt: number;
}

interface OverviewPayload {
  kpis: OverviewKpis;
  livePools: LivePoolRow[];
  timeSeries: TimeSeriesPayload;
}

const PUBLIC_TYPE_LABEL: Record<number, string> = {
  0: "WEEKLY",
  1: "BIWEEKLY",
  2: "TRIWEEKLY",
  3: "MONTHLY",
};

const PUBLIC_TYPE_ACCENT: Record<number, string> = {
  0: LAVENDER,
  1: CORAL,
  2: MINT,
  3: SAND,
};

const REFRESH_MS = 30_000;

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch("/api/admin/overview", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const payload = (await r.json()) as OverviewPayload;
        if (!cancelled) {
          setData(payload);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err) {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Overview</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          Couldn&apos;t load metrics: {err}
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Overview</h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Loading metrics from the chain…
        </p>
      </main>
    );
  }

  const { kpis, livePools, timeSeries } = data;
  const totalPools =
    kpis.pools.public.open +
    kpis.pools.public.drawing +
    kpis.pools.public.resolved +
    kpis.pools.private.open +
    kpis.pools.private.drawing +
    kpis.pools.private.resolved;
  const livePoolsCount =
    kpis.pools.public.open +
    kpis.pools.public.drawing +
    kpis.pools.private.open +
    kpis.pools.private.drawing;
  const resolvedCount =
    kpis.pools.public.resolved + kpis.pools.private.resolved;

  return (
    <main className="mx-auto max-w-7xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Platform overview
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            Live readout · last refresh {ago(kpis.generatedAt)}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 4 · lifetime + DAU/WAU/MAU + 30d new-user trend
        </p>
      </div>

      {/* Activity strip — DAU/WAU/MAU + new users + sparkline */}
      <ActivityStrip ts={timeSeries} />

      {/* KPI grid */}
      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="LIFETIME VOLUME"
          value={`${formatSol(BigInt(kpis.lifetimeVolumeLamports))}`}
          accent={MINT}
          sub={`${kpis.totalTickets} TICKETS SOLD`}
        />
        <Kpi
          label="LIFETIME FEES"
          value={`${formatSol(BigInt(kpis.lifetimeFeesLamports))}`}
          accent={LAVENDER}
          sub="0.5% TAKE − VRF"
        />
        <Kpi
          label="LIFETIME PAYOUTS"
          value={`${formatSol(BigInt(kpis.lifetimePayoutsLamports))}`}
          sub={`${resolvedCount} RESOLVED POOLS`}
        />
        <Kpi
          label="PENDING PAYOUT"
          value={`${formatSol(BigInt(kpis.pendingPayoutsLamports))}`}
          sub={`${kpis.pools.public.drawing + kpis.pools.private.drawing} POOLS DRAWING`}
          accent={
            kpis.pools.public.drawing + kpis.pools.private.drawing > 0
              ? SAND
              : undefined
          }
        />
        <Kpi
          label="TOTAL USERS"
          value={kpis.totalUsers.toLocaleString()}
          sub="PROFILES CLAIMED"
        />
        <Kpi
          label="LIVE POOLS"
          value={String(livePoolsCount)}
          sub={`OF ${totalPools} TOTAL`}
        />
        <Kpi
          label="POOL MIX"
          value={`${kpis.pools.public.open + kpis.pools.public.drawing + kpis.pools.public.resolved} / ${kpis.pools.private.open + kpis.pools.private.drawing + kpis.pools.private.resolved}`}
          sub="PUBLIC / PRIVATE"
        />
        <Kpi
          label="TREASURY BAL"
          value={formatSol(BigInt(kpis.treasury.balanceLamports))}
          sub={
            kpis.treasury.address
              ? `${shortAddress(kpis.treasury.address)} · ${kpis.treasury.isMultisig ? "MULTISIG ✓" : "VERIFY IN SQUADS"}`
              : "ADDRESS UNAVAILABLE"
          }
          accent={kpis.treasury.address ? MINT : CORAL}
        />
      </section>

      {/* Live pools roster */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-base uppercase tracking-wide">
            Live pools · soonest close first
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {livePools.length === 0
              ? "NO LIVE POOLS"
              : `${livePools.length} OF ${livePoolsCount}`}
          </span>
        </div>
        {livePools.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            No live pools right now
          </p>
        ) : (
          <div className="flex flex-col">
            {livePools.map((p) => (
              <LivePoolRowItem key={p.address} pool={p} />
            ))}
          </div>
        )}
      </section>

    </main>
  );
}

function ActivityStrip({ ts }: { ts: TimeSeriesPayload }) {
  return (
    <section
      className="mt-7 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"
      aria-label="User activity"
    >
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-3 md:gap-5">
          <ActivityKpi
            label="DAU"
            value={ts.dau}
            sub="24H ACTIVE"
            accent={MINT}
          />
          <ActivityKpi
            label="WAU"
            value={ts.wau}
            sub="7D ACTIVE"
            accent={LAVENDER}
          />
          <ActivityKpi
            label="MAU"
            value={ts.mau}
            sub="30D ACTIVE"
            accent={SAND}
          />
        </div>
        <div className="md:border-l md:border-neutral-800 md:pl-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-sm uppercase tracking-wide">
              New users · 30d
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              7D · {ts.newUsers7d} &nbsp;·&nbsp; 30D · {ts.newUsers30d}
            </span>
          </div>
          <Sparkline data={ts.newUsersByDay} />
        </div>
      </div>
    </section>
  );
}

function ActivityKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4"
      style={{
        background: `linear-gradient(135deg, ${accent}10, ${accent}03 60%, transparent), rgba(10,10,10,.6)`,
      }}
    >
      <p
        className="font-mono text-[10px] uppercase tracking-widest"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p
        className="mt-1 font-display text-3xl tabular-nums leading-none"
        style={{ color: accent }}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {sub}
      </p>
    </div>
  );
}

/**
 * Pure-SVG bar sparkline. Empty days are rendered as low-opacity ticks
 * so the user can see day boundaries even on a dead chart. Today is
 * highlighted with a brighter fill.
 */
function Sparkline({ data }: { data: Array<{ day: string; count: number }> }) {
  if (data.length === 0) {
    return (
      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
        Empty — run /api/admin/maintenance/backfill once to seed history
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 100 / data.length;
  return (
    <svg
      viewBox="0 0 100 32"
      className="mt-3 h-16 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="New users per day, last 30 days"
    >
      {data.map((d, i) => {
        const h = d.count > 0 ? Math.max(1.5, (d.count / max) * 28) : 0.8;
        const x = i * w + 0.5;
        const y = 32 - h;
        const isToday = i === data.length - 1;
        return (
          <rect
            key={d.day}
            x={x}
            y={y}
            width={Math.max(0.5, w - 1)}
            height={h}
            rx="0.6"
            fill={isToday ? LAVENDER : MINT}
            opacity={d.count === 0 ? 0.18 : isToday ? 1 : 0.85}
          >
            <title>{`${d.day} · ${d.count} new`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <article
      className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"
      style={
        accent
          ? {
              background: `linear-gradient(135deg, ${accent}10, ${accent}03 60%, transparent), rgba(23,23,23,.4)`,
            }
          : undefined
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p
        className="mt-2 font-display text-3xl tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </p>
      )}
    </article>
  );
}

function LivePoolRowItem({ pool }: { pool: LivePoolRow }) {
  const accent =
    pool.kind === "private"
      ? "#fafafa"
      : (PUBLIC_TYPE_ACCENT[pool.poolType ?? 0] ?? MINT);
  const name =
    pool.kind === "private"
      ? `PRIVATE · ${shortAddress(pool.address)}`
      : `${PUBLIC_TYPE_LABEL[pool.poolType ?? 0] ?? "PUBLIC"} #${pool.round}`;
  const status = pool.state === 1 ? "DRAWING" : "OPEN";
  return (
    <div
      className="flex items-center gap-4 border-b border-neutral-800/60 px-1 py-3 last:border-0"
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-sm uppercase tracking-wide">
          {name}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {shortAddress(pool.address)}
        </span>
      </span>
      <span className="hidden font-mono text-[11px] tabular-nums text-neutral-300 sm:inline">
        {pool.totalTickets} TICKETS
      </span>
      <span
        className="font-mono text-[11px] font-bold tabular-nums"
        style={{ color: accent }}
      >
        {formatSol(BigInt(pool.totalPotLamports))}
      </span>
      <span
        className="rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-widest"
        style={{
          borderColor: `${accent}55`,
          background: `${accent}15`,
          color: accent,
        }}
      >
        {status === "OPEN" ? (
          <>
            CLOSES IN <Countdown targetUnix={pool.closeTimeUnix} />
          </>
        ) : (
          "DRAWING"
        )}
      </span>
    </div>
  );
}

function ago(unixSec: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3_600)}h ago`;
}

"use client";

// /admin/risk — aggregated flag feed.
//
// Surfaces every heuristic flag from /admin/users and /admin/pools in
// one place, sorted high→low severity. Each row deep-links to the
// source page so admins can investigate without page-hopping.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CORAL, MINT, SAND } from "@/lib/colors";

type RiskSeverity = "high" | "medium" | "low";
type RiskKind =
  | "STUCK"
  | "CONCENTRATED_STAKE"
  | "SELF_DEAL_SUSPECT"
  | "EMPTY"
  | "HIGH_ACTIVITY"
  | "BIG_SPENDER"
  | "UNCLAIMED_HIGH_SPEND";

interface RiskItem {
  id: string;
  kind: RiskKind;
  severity: RiskSeverity;
  title: string;
  detail: string;
  source: "pool" | "user";
  subjectId: string;
  relatedId?: string;
}

interface RiskPayload {
  items: RiskItem[];
  totals: {
    high: number;
    medium: number;
    low: number;
    byKind: Partial<Record<RiskKind, number>>;
  };
  generatedAt: number;
}

type SeverityFilter = "all" | RiskSeverity;
type KindFilter = "all" | RiskKind;

const SEV_ACCENT: Record<RiskSeverity, string> = {
  high: CORAL,
  medium: SAND,
  low: MINT,
};

const KIND_LABEL: Record<RiskKind, string> = {
  STUCK: "STUCK",
  CONCENTRATED_STAKE: "CONCENTRATED STAKE",
  SELF_DEAL_SUSPECT: "SELF-DEAL SUSPECT",
  EMPTY: "EMPTY POOL",
  HIGH_ACTIVITY: "HIGH ACTIVITY",
  BIG_SPENDER: "BIG SPENDER",
  UNCLAIMED_HIGH_SPEND: "UNCLAIMED HIGH SPEND",
};

export default function AdminRiskPage() {
  const [data, setData] = useState<RiskPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sev, setSev] = useState<SeverityFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");

  useEffect(() => {
    const ctl = { cancelled: false };
    async function load() {
      try {
        const r = await fetch("/api/admin/risk", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const p = (await r.json()) as RiskPayload;
        if (!ctl.cancelled) {
          setData(p);
          setErr(null);
        }
      } catch (e) {
        if (!ctl.cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      ctl.cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.items.filter((it) => {
      if (sev !== "all" && it.severity !== sev) return false;
      if (kind !== "all" && it.kind !== kind) return false;
      return true;
    });
  }, [data, sev, kind]);

  if (err) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Risk feed</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          {err}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Risk feed</h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Risk feed
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            {filtered.length} of {data.items.length} match · {data.totals.high} high · {data.totals.medium} medium · {data.totals.low} low
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 3 · heuristics · alerting lands in phase 5
        </p>
      </div>

      <section className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <SevChips value={sev} onChange={setSev} totals={data.totals} />
        <KindChips value={kind} onChange={setKind} totals={data.totals.byKind} />
      </section>

      <section className="mt-6 flex flex-col gap-3">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            No matches for these filters
          </p>
        ) : (
          filtered.map((it) => <RiskRow key={it.id} item={it} />)
        )}
      </section>
    </main>
  );
}

function RiskRow({ item }: { item: RiskItem }) {
  const accent = SEV_ACCENT[item.severity];
  const href =
    item.source === "pool"
      ? `/admin/pools/${item.subjectId}`
      : `/admin/users/${item.subjectId}`;
  return (
    <Link
      href={href}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border bg-neutral-900/40 p-5 transition hover:-translate-y-px"
      style={{ borderColor: `${accent}55` }}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-xl font-mono text-sm font-bold"
        style={{ background: `${accent}1a`, color: accent }}
      >
        {item.severity === "high" ? "!" : item.severity === "medium" ? "▲" : "·"}
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-base uppercase tracking-wide">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-neutral-400">{item.detail}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          {KIND_LABEL[item.kind]} · {item.source.toUpperCase()} {item.subjectId.slice(0, 6)}…{item.subjectId.slice(-4)}
        </p>
      </div>
      <span
        className="font-mono text-[10px] uppercase tracking-widest"
        style={{ color: accent }}
      >
        INSPECT →
      </span>
    </Link>
  );
}

function SevChips({
  value,
  onChange,
  totals,
}: {
  value: SeverityFilter;
  onChange: (v: SeverityFilter) => void;
  totals: RiskPayload["totals"];
}) {
  const opts: ReadonlyArray<{ v: SeverityFilter; l: string; n: number; a?: string }> = [
    { v: "all", l: "ALL", n: totals.high + totals.medium + totals.low },
    { v: "high", l: "HIGH", n: totals.high, a: CORAL },
    { v: "medium", l: "MEDIUM", n: totals.medium, a: SAND },
    { v: "low", l: "LOW", n: totals.low, a: MINT },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        Severity
      </span>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = o.v === value;
          const style: React.CSSProperties =
            on && o.a
              ? {
                  background: `${o.a}1a`,
                  borderColor: `${o.a}55`,
                  color: o.a,
                }
              : on
                ? { background: "#1a1a1a", borderColor: "#404040", color: "#fafafa" }
                : {};
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              style={style}
              className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest transition ${
                on
                  ? ""
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
              }`}
            >
              {o.l}{" "}
              <span className="ml-1 text-[8px] text-neutral-500">({o.n})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KindChips({
  value,
  onChange,
  totals,
}: {
  value: KindFilter;
  onChange: (v: KindFilter) => void;
  totals: RiskPayload["totals"]["byKind"];
}) {
  const opts: ReadonlyArray<{ v: KindFilter; l: string }> = [
    { v: "all", l: "ALL" },
    { v: "STUCK", l: "STUCK" },
    { v: "SELF_DEAL_SUSPECT", l: "SELF-DEAL" },
    { v: "CONCENTRATED_STAKE", l: "CONCENTRATED" },
    { v: "UNCLAIMED_HIGH_SPEND", l: "UNCLAIMED" },
    { v: "BIG_SPENDER", l: "BIG SPENDER" },
    { v: "HIGH_ACTIVITY", l: "HIGH ACTIVITY" },
    { v: "EMPTY", l: "EMPTY POOL" },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        Kind
      </span>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = o.v === value;
          const count = o.v === "all" ? undefined : (totals[o.v as RiskKind] ?? 0);
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest transition ${
                on
                  ? "border-neutral-500 bg-neutral-800 text-neutral-100"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
              }`}
            >
              {o.l}
              {typeof count === "number" && (
                <span className="ml-1 text-[8px] text-neutral-500">({count})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

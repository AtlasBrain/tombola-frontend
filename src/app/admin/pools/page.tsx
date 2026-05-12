"use client";

// /admin/pools — pool roster with state + cadence filters.
//
// Reference: docs/design/mockups/admin-3-pools.html.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";
import { formatSol, shortAddress } from "@/lib/format";
import { Countdown } from "@/components/Countdown";

interface PoolRow {
  address: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  creator?: string;
  creatorFeeBps?: number;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: string;
  totalPotLamports: string;
  ticketPriceLamports: string;
  participants: number;
  feesLamports: string;
  invitesSent?: number;
  invitesRedeemed?: number;
  winner?: string;
  flags: string[];
}

interface PoolsPayload {
  rows: PoolRow[];
  totals: {
    totalPools: number;
    publicCount: number;
    privateCount: number;
    livePools: number;
    drawingPools: number;
    resolvedPools: number;
    emptyPrivatePools: number;
    invitesSent: number;
    invitesRedeemed: number;
  };
  generatedAt: number;
}

type StateFilter = "all" | "open" | "drawing" | "resolved" | "empty";
type KindFilter = "all" | "public" | "private" | "weekly" | "biweekly" | "triweekly" | "monthly";

const PUBLIC_LABEL: Record<number, string> = {
  0: "WEEKLY",
  1: "BIWEEKLY",
  2: "TRIWEEKLY",
  3: "MONTHLY",
};
const PUBLIC_ACCENT: Record<number, string> = {
  0: LAVENDER,
  1: CORAL,
  2: MINT,
  3: SAND,
};
const PAGE_SIZE = 25;

export default function AdminPoolsPage() {
  const [data, setData] = useState<PoolsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stateF, setStateF] = useState<StateFilter>("all");
  const [kindF, setKindF] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/pools", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const p = (await r.json()) as PoolsPayload;
        if (!cancelled) {
          setData(p);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((p) => {
      if (needle) {
        const hay = `${p.address} ${p.creator ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (stateF === "open" && p.state !== 0) return false;
      if (stateF === "drawing" && p.state !== 1) return false;
      if (stateF === "resolved" && p.state !== 2) return false;
      if (stateF === "empty" && !p.flags.includes("EMPTY")) return false;
      if (kindF === "public" && p.kind !== "public") return false;
      if (kindF === "private" && p.kind !== "private") return false;
      if (kindF === "weekly" && p.poolType !== 0) return false;
      if (kindF === "biweekly" && p.poolType !== 1) return false;
      if (kindF === "triweekly" && p.poolType !== 2) return false;
      if (kindF === "monthly" && p.poolType !== 3) return false;
      return true;
    });
  }, [data, q, stateF, kindF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (err) {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Pools</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          Couldn&apos;t load pools: {err}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Pools &amp; operator
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            {data
              ? `${filtered.length} match · ${data.totals.totalPools} total · ${data.totals.livePools + data.totals.drawingPools} live · ${data.totals.resolvedPools} resolved`
              : "Loading…"}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 2 · live readout
        </p>
      </div>

      {data && (
        <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Quick label="PUBLIC · LIFETIME" value={String(data.totals.publicCount)} />
          <Quick
            label="PRIVATE · LIFETIME"
            value={String(data.totals.privateCount)}
            accent={LAVENDER}
          />
          <Quick
            label="DRAWING"
            value={String(data.totals.drawingPools)}
            accent={data.totals.drawingPools > 0 ? SAND : undefined}
          />
          <Quick label="EMPTY PRIVATE" value={String(data.totals.emptyPrivatePools)} />
          <Quick label="INVITES SENT" value={String(data.totals.invitesSent)} />
          <Quick
            label="INVITES REDEEMED"
            value={
              data.totals.invitesSent === 0
                ? "0%"
                : `${Math.round(
                    (data.totals.invitesRedeemed / data.totals.invitesSent) * 100,
                  )}%`
            }
            accent={SAND}
            sub={`${data.totals.invitesRedeemed}/${data.totals.invitesSent}`}
          />
        </section>
      )}

      <section className="mt-6 grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 md:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Pool address or creator wallet…"
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 font-mono text-[12px] text-neutral-100 outline-none transition focus:border-neutral-600"
          aria-label="Filter pools"
        />
        <FilterChips
          label="State"
          value={stateF}
          onChange={(v) => {
            setStateF(v as StateFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "open", l: "OPEN", on: "mint" },
            { v: "drawing", l: "DRAWING", on: "sand" },
            { v: "resolved", l: "RESOLVED" },
            { v: "empty", l: "EMPTY" },
          ]}
        />
        <FilterChips
          label="Kind"
          value={kindF}
          onChange={(v) => {
            setKindF(v as KindFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "public", l: "PUBLIC" },
            { v: "private", l: "PRIVATE", on: "lavender" },
            { v: "weekly", l: "WEEKLY" },
            { v: "biweekly", l: "BIWEEKLY" },
            { v: "triweekly", l: "TRIWEEKLY" },
            { v: "monthly", l: "MONTHLY" },
          ]}
        />
      </section>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="px-4 py-3">POOL</th>
              <th className="px-4 py-3">CREATOR</th>
              <th className="px-4 py-3 text-right">TICKETS</th>
              <th className="px-4 py-3 text-right">BUYERS</th>
              <th className="px-4 py-3 text-right">POT</th>
              <th className="px-4 py-3 text-right">FEES</th>
              <th className="px-4 py-3">STATE</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  Loading…
                </td>
              </tr>
            )}
            {data && slice.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  No pools match these filters
                </td>
              </tr>
            )}
            {slice.map((p) => (
              <PoolTableRow key={p.address} p={p} />
            ))}
          </tbody>
        </table>
      </section>

      {data && filtered.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span>
            SHOWING {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} OF {filtered.length}
          </span>
          <div className="flex gap-2">
            <PagerBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
              PREV
            </PagerBtn>
            <span className="rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300">
              {safePage} / {totalPages}
            </span>
            <PagerBtn disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
              NEXT
            </PagerBtn>
          </div>
        </div>
      )}
    </main>
  );
}

function PoolTableRow({ p }: { p: PoolRow }) {
  const accent =
    p.kind === "private"
      ? "#fafafa"
      : (PUBLIC_ACCENT[p.poolType ?? 0] ?? MINT);
  const name =
    p.kind === "private"
      ? `PRIVATE · ${shortAddress(p.address)}`
      : `${PUBLIC_LABEL[p.poolType ?? 0] ?? "PUBLIC"} #${p.round}`;
  // (state label rendered inline by StatePill below — kept for grep)
  return (
    <tr className="border-t border-dashed border-neutral-800 transition hover:bg-neutral-900/60">
      <td className="px-4 py-3">
        <Link
          href={`/admin/pools/${p.address}`}
          className="flex min-w-0 items-center gap-3"
        >
          <span
            aria-hidden
            className="h-9 w-1.5 rounded-full"
            style={{ background: accent }}
          />
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-sm uppercase tracking-wide">
              {name}
            </span>
            <span className="font-mono text-[10px] text-neutral-500">
              {shortAddress(p.address)}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3 font-mono text-[11px]">
        {p.creator ? (
          <Link href={`/admin/users/${p.creator}`} className="text-neutral-300 hover:underline">
            {shortAddress(p.creator)}
          </Link>
        ) : (
          <span className="text-neutral-500">PROTOCOL</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {p.totalTickets}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {p.participants}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums">
        {formatSol(BigInt(p.totalPotLamports))}
      </td>
      <td
        className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums"
        style={{ color: MINT }}
      >
        {formatSol(BigInt(p.feesLamports))}
      </td>
      <td className="px-4 py-3">
        <StatePill state={p.state} closeTimeUnix={p.closeTimeUnix} accent={accent} />
      </td>
      <td className="px-4 py-3">
        {p.flags
          .filter((f) => f !== "EMPTY")
          .slice(0, 1)
          .map((f) => (
            <span
              key={f}
              className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
              style={{
                background: `${CORAL}1a`,
                borderColor: `${CORAL}55`,
                color: CORAL,
              }}
            >
              ▲ {f.replace(/_/g, " ")}
            </span>
          ))}
        {p.flags.includes("EMPTY") && (
          <span
            className="rounded-full border border-dashed px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
            style={{
              borderColor: "#262626",
              color: "#525252",
            }}
          >
            EMPTY
          </span>
        )}
      </td>
    </tr>
  );
}

function StatePill({
  state,
  closeTimeUnix,
  accent,
}: {
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  accent: string;
}) {
  if (state === 0) {
    const open = closeTimeUnix * 1000 > Date.now();
    return (
      <span
        className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
        style={{
          borderColor: `${accent}55`,
          background: `${accent}15`,
          color: accent,
        }}
      >
        {open ? (
          <>
            OPEN · <Countdown targetUnix={closeTimeUnix} />
          </>
        ) : (
          "CLOSED · PENDING DRAW"
        )}
      </span>
    );
  }
  if (state === 1) {
    return (
      <span
        className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
        style={{
          borderColor: `${SAND}55`,
          background: `${SAND}15`,
          color: SAND,
        }}
      >
        DRAWING
      </span>
    );
  }
  return (
    <span className="rounded-full border border-neutral-800 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-neutral-400">
      RESOLVED
    </span>
  );
}

function Quick({
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
      className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4"
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
        className="mt-1 font-display text-2xl tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </p>
      )}
    </article>
  );
}

function FilterChips<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ v: T; l: string; on?: "mint" | "sand" | "lavender" }>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.v === value;
          const accent =
            o.on === "mint" ? MINT : o.on === "sand" ? SAND : o.on === "lavender" ? LAVENDER : null;
          const style: React.CSSProperties =
            on && accent
              ? {
                  background: `${accent}1a`,
                  borderColor: `${accent}55`,
                  color: accent,
                }
              : on
                ? {
                    background: "#1a1a1a",
                    borderColor: "#404040",
                    color: "#fafafa",
                  }
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
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PagerBtn({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-neutral-800 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

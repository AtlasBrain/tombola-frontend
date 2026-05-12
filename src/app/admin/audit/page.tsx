"use client";

// /admin/audit — append-only audit log of every admin-route hit.
//
// Each row is "wallet X hit path Y at time Z with status S". Filters:
// time range, wallet, path substring, status. Newest-first display.

import { useEffect, useMemo, useState } from "react";
import { CORAL, MINT, SAND } from "@/lib/colors";
import { shortAddress } from "@/lib/format";

interface AuditEvent {
  ts: number;
  wallet: string;
  method: string;
  path: string;
  status: number;
  meta?: Record<string, unknown>;
  salt: string;
}

interface AuditPayload {
  events: AuditEvent[];
}

type Window = "1h" | "24h" | "7d" | "30d";
type StatusFilter = "all" | "200" | "403";

const WINDOW_MS: Record<Window, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export default function AdminAuditPage() {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [windowF, setWindowF] = useState<Window>("24h");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [walletQ, setWalletQ] = useState("");
  const [pathQ, setPathQ] = useState("");

  useEffect(() => {
    const ctl = { cancelled: false };
    async function load() {
      try {
        const params = new URLSearchParams();
        const to = Date.now();
        const from = to - WINDOW_MS[windowF];
        params.set("from", String(from));
        params.set("to", String(to));
        params.set("limit", "500");
        if (status !== "all") params.set("status", status);
        if (walletQ.trim().length >= 4) params.set("wallet", walletQ.trim());
        if (pathQ.trim().length > 0) params.set("path", pathQ.trim());
        const r = await fetch(`/api/admin/audit?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const p = (await r.json()) as AuditPayload;
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
  }, [windowF, status, walletQ, pathQ]);

  const newestFirst = useMemo(() => {
    if (!data) return [];
    return [...data.events].sort((a, b) => b.ts - a.ts);
  }, [data]);

  if (err) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Audit log</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          {err}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Audit log
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            {data
              ? `${newestFirst.length} event${newestFirst.length === 1 ? "" : "s"} · last ${windowF} · newest first`
              : "Loading…"}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 5 · admin actions · 90d retention
        </p>
      </div>

      <section className="mt-6 grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 md:grid-cols-[auto_auto_1fr_1fr]">
        <FilterChips
          label="Window"
          value={windowF}
          onChange={(v) => setWindowF(v as Window)}
          options={[
            { v: "1h", l: "1H" },
            { v: "24h", l: "24H" },
            { v: "7d", l: "7D" },
            { v: "30d", l: "30D" },
          ]}
        />
        <FilterChips
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { v: "all", l: "ALL" },
            { v: "200", l: "200", on: "mint" },
            { v: "403", l: "403", on: "coral" },
          ]}
        />
        <LabeledInput
          label="Wallet (≥4 chars)"
          value={walletQ}
          onChange={setWalletQ}
          placeholder="A9XZ…"
        />
        <LabeledInput
          label="Path contains"
          value={pathQ}
          onChange={setPathQ}
          placeholder="/admin/users"
        />
      </section>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="px-4 py-3">WHEN</th>
              <th className="px-4 py-3">WALLET</th>
              <th className="px-4 py-3">METHOD</th>
              <th className="px-4 py-3">PATH</th>
              <th className="px-4 py-3 text-right">STATUS</th>
              <th className="px-4 py-3">META</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500"
                >
                  Loading…
                </td>
              </tr>
            )}
            {data && newestFirst.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500"
                >
                  No events match these filters
                </td>
              </tr>
            )}
            {newestFirst.map((ev) => (
              <tr key={ev.salt} className="border-t border-dashed border-neutral-800">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-[11px] text-neutral-200">
                    {whenStamp(ev.ts)}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-500">
                    {agoCompact(ev.ts)}
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px]">
                  {ev.wallet ? shortAddress(ev.wallet) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <MethodPill method={ev.method} />
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-200">
                  {ev.path}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <StatusPill status={ev.status} />
                </td>
                <td className="px-4 py-2.5">
                  {ev.meta && Object.keys(ev.meta).length > 0 ? (
                    <code className="font-mono text-[10px] text-neutral-400">
                      {JSON.stringify(ev.meta)}
                    </code>
                  ) : (
                    <span className="font-mono text-[10px] text-neutral-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function MethodPill({ method }: { method: string }) {
  const color =
    method === "DELETE" ? CORAL : method === "POST" ? SAND : MINT;
  return (
    <span
      className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
      style={{
        borderColor: `${color}55`,
        background: `${color}14`,
        color,
      }}
    >
      {method}
    </span>
  );
}

function StatusPill({ status }: { status: number }) {
  const color =
    status >= 500
      ? CORAL
      : status >= 400
        ? CORAL
        : status >= 300
          ? SAND
          : MINT;
  return (
    <span
      className="rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tabular-nums"
      style={{
        borderColor: `${color}55`,
        background: `${color}14`,
        color,
      }}
    >
      {status}
    </span>
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
  onChange: (v: T) => void;
  options: ReadonlyArray<{ v: T; l: string; on?: "mint" | "coral" }>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.v === value;
          const accent = o.on === "mint" ? MINT : o.on === "coral" ? CORAL : null;
          const style: React.CSSProperties =
            on && accent
              ? {
                  background: `${accent}14`,
                  borderColor: `${accent}55`,
                  color: accent,
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
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[11px] text-neutral-100 outline-none transition focus:border-neutral-600"
      />
    </div>
  );
}

function whenStamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${d.toISOString().slice(0, 10)} ${hh}:${mm}:${ss}Z`;
}

function agoCompact(ms: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}

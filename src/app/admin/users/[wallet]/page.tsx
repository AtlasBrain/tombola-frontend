"use client";

// /admin/users/[wallet] — single-user drill-down.
//
// Renders the per-user totals (mockup #2 bottom section): lifetime
// stats KPIs, activity timeline, cadence breakdown bars, friend lists,
// risk readout. Lifts data from /api/admin/users/:wallet.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSol, shortAddress } from "@/lib/format";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";

interface UserDetail {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  isPublic: boolean;
  createdAtMs: number;
  totals: {
    pools: number;
    tickets: string;
    spentLamports: string;
    wins: number;
    wonLamports: string;
    netPnLLamports: string;
    bestWinLamports: string;
  };
  participations: Array<{
    pool: string;
    kind: "public" | "private";
    poolType?: number;
    round?: string;
    state: 0 | 1 | 2;
    closeTimeUnix: number;
    myTickets: string;
    mySpentLamports: string;
    totalTickets: string;
    totalPotLamports: string;
    iWon: boolean;
    myShareLamports: string;
  }>;
  cadenceBreakdown: Array<{
    cadence: "WEEKLY" | "BIWEEKLY" | "TRIWEEKLY" | "MONTHLY" | "PRIVATE";
    pools: number;
    tickets: string;
    spentLamports: string;
  }>;
  friends: {
    accepted: string[];
    pendingOut: string[];
    pendingIn: string[];
  };
  flags: string[];
}

const CADENCE_COLOR: Record<UserDetail["cadenceBreakdown"][number]["cadence"], string> = {
  WEEKLY: LAVENDER,
  BIWEEKLY: CORAL,
  TRIWEEKLY: MINT,
  MONTHLY: SAND,
  PRIVATE: "#fafafa",
};

export default function AdminUserDetailPage() {
  const { wallet } = useParams<{ wallet: string }>();
  const [data, setData] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctl = { cancelled: false };
    async function load() {
      try {
        const r = await fetch(`/api/admin/users/${wallet}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const payload = (await r.json()) as UserDetail;
        if (!ctl.cancelled) setData(payload);
      } catch (e) {
        if (!ctl.cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      ctl.cancelled = true;
    };
  }, [wallet]);

  if (err) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <BackLink />
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          {err}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <BackLink />
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Loading…
        </p>
      </main>
    );
  }

  const totalSpent = BigInt(data.totals.spentLamports);
  const totalWon = BigInt(data.totals.wonLamports);
  const netPnL = BigInt(data.totals.netPnLLamports);
  const initial = (data.pseudo ?? data.wallet ?? "?").charAt(0).toUpperCase();

  const cadenceMax = data.cadenceBreakdown.reduce(
    (acc, c) => (BigInt(c.spentLamports) > acc ? BigInt(c.spentLamports) : acc),
    1n,
  );

  return (
    <main className="mx-auto max-w-5xl px-8 pb-16 pt-8">
      <BackLink />

      <header className="mt-3 flex flex-wrap items-center gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-xl font-bold"
          style={{
            background: "linear-gradient(135deg, #3f3f46, #18181b)",
            color: "#f5f5f5",
          }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl uppercase tracking-tight">
            {data.pseudo ?? "Anonymous wallet"}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            {data.wallet}
            {data.xHandle && ` · @${data.xHandle}`}
            {" · "}
            {data.isPublic ? "PUBLIC" : "PRIVATE 🔒"}
            {data.createdAtMs > 0 &&
              ` · JOINED ${new Date(data.createdAtMs).toISOString().slice(0, 10)}`}
          </p>
        </div>
        {data.flags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {data.flags.map((f) => (
              <span
                key={f}
                className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest"
                style={{
                  background: `${CORAL}1a`,
                  borderColor: `${CORAL}55`,
                  color: CORAL,
                }}
              >
                ▲ {f.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="LIFETIME SPEND"
          value={formatSol(totalSpent)}
          sub={`${data.totals.pools} POOLS`}
        />
        <Kpi
          label="LIFETIME WINS"
          value={`${data.totals.wins}`}
          accent={data.totals.wins > 0 ? MINT : undefined}
          sub={`OF ${countResolved(data.participations)} RESOLVED`}
        />
        <Kpi
          label="LIFETIME WON"
          value={formatSol(totalWon)}
          accent={totalWon > 0n ? MINT : undefined}
          sub={`BEST ${formatSol(BigInt(data.totals.bestWinLamports))}`}
        />
        <Kpi
          label="NET P&L"
          value={`${netPnL > 0n ? "+" : netPnL < 0n ? "" : ""}${formatSol(netPnL)}`}
          accent={netPnL > 0n ? MINT : netPnL < 0n ? CORAL : undefined}
          sub="RESOLVED ONLY"
        />
      </section>

      {/* Cadence breakdown */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-display text-base uppercase tracking-wide">
          Pool participation breakdown
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {data.cadenceBreakdown.length === 0 && (
            <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              No on-chain participation
            </p>
          )}
          {data.cadenceBreakdown.map((c) => {
            const pct =
              Number((BigInt(c.spentLamports) * 100n) / cadenceMax) || 0;
            return (
              <div key={c.cadence} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                  {c.cadence}
                </span>
                <span className="relative h-3 rounded-full bg-neutral-900">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: CADENCE_COLOR[c.cadence],
                    }}
                  />
                </span>
                <span className="font-mono text-[11px] tabular-nums text-neutral-200">
                  {c.pools} pool{c.pools === 1 ? "" : "s"} ·{" "}
                  <span className="font-bold" style={{ color: CADENCE_COLOR[c.cadence] }}>
                    {formatSol(BigInt(c.spentLamports))}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Timeline */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-display text-base uppercase tracking-wide">
          On-chain activity ({data.participations.length} pools)
        </h2>
        <div className="mt-4 flex flex-col">
          {data.participations.slice(0, 50).map((p) => (
            <PoolEntryRow key={p.pool} p={p} />
          ))}
          {data.participations.length > 50 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              Showing first 50 · {data.participations.length - 50} more
            </p>
          )}
        </div>
      </section>

      {/* Friends */}
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <FriendsCard
          title={`Friends · ${data.friends.accepted.length}`}
          wallets={data.friends.accepted}
        />
        <FriendsCard
          title={`Pending out · ${data.friends.pendingOut.length}`}
          wallets={data.friends.pendingOut}
        />
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500 transition hover:text-neutral-100"
    >
      ← BACK TO USERS
    </Link>
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
              background: `linear-gradient(135deg, ${accent}12, ${accent}03 60%, transparent), rgba(23,23,23,.4)`,
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
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </p>
      )}
    </article>
  );
}

function PoolEntryRow({ p }: { p: UserDetail["participations"][number] }) {
  const accent =
    p.kind === "private"
      ? "#fafafa"
      : p.poolType === 0
        ? LAVENDER
        : p.poolType === 1
          ? CORAL
          : p.poolType === 2
            ? MINT
            : SAND;
  const name =
    p.kind === "private"
      ? `PRIVATE · ${shortAddress(p.pool)}`
      : `${PUBLIC_LABEL[p.poolType ?? 0] ?? "PUBLIC"} #${p.round}`;
  const stateLabel = p.state === 0 ? "OPEN" : p.state === 1 ? "DRAWING" : p.iWon ? "WON" : "RESOLVED";
  const stateColor =
    p.state === 0
      ? MINT
      : p.state === 1
        ? SAND
        : p.iWon
          ? MINT
          : "#737373";
  return (
    <Link
      href={`/admin/pools/${p.pool}`}
      className="grid grid-cols-[6px_1fr_auto_auto_auto] items-center gap-3 border-b border-dashed border-neutral-800 py-3 transition hover:bg-neutral-900/60"
    >
      <span
        aria-hidden
        className="h-8 w-1.5 rounded-full"
        style={{ background: accent }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-sm uppercase tracking-wide">
          {name}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {p.myTickets} TICKETS · {formatSol(BigInt(p.mySpentLamports))} SPENT
        </span>
      </span>
      <span className="hidden font-mono text-[11px] tabular-nums text-neutral-400 md:inline">
        POT {formatSol(BigInt(p.totalPotLamports))}
      </span>
      {p.iWon ? (
        <span
          className="font-mono text-[11px] font-bold tabular-nums"
          style={{ color: MINT }}
        >
          🏆 +{formatSol(BigInt(p.myShareLamports))}
        </span>
      ) : (
        <span className="font-mono text-[11px] tabular-nums text-neutral-500">—</span>
      )}
      <span
        className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
        style={{ borderColor: `${stateColor}55`, color: stateColor }}
      >
        {stateLabel}
      </span>
    </Link>
  );
}

const PUBLIC_LABEL: Record<number, string> = {
  0: "WEEKLY",
  1: "BIWEEKLY",
  2: "TRIWEEKLY",
  3: "MONTHLY",
};

function FriendsCard({ title, wallets }: { title: string; wallets: string[] }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <h3 className="font-display text-sm uppercase tracking-wide">
        {title}
      </h3>
      {wallets.length === 0 ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          None
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {wallets.slice(0, 32).map((w) => (
            <Link
              key={w}
              href={`/admin/users/${w}`}
              className="rounded-full border border-neutral-800 px-2.5 py-1 font-mono text-[10px] text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100"
            >
              {shortAddress(w)}
            </Link>
          ))}
          {wallets.length > 32 && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              + {wallets.length - 32} more
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function countResolved(
  participations: UserDetail["participations"],
): number {
  return participations.filter((p) => p.state === 2).length;
}

"use client";

// /admin/users — paginated user table with filters + sort.
//
// Filtering, sort, and pagination are client-side: the API ships the
// full snapshot in one shot (at our scale, ≤ low thousands of rows,
// this is cheaper than a chatty server-paginated API and lets the
// founder slice the data interactively without round-trips).
//
// Visual reference: docs/design/mockups/admin-2-users.html.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatSol, shortAddress } from "@/lib/format";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";

interface UserRow {
  wallet: string;
  pseudo: string | null;
  xHandle: string | null;
  isPublic: boolean;
  createdAtMs: number;
  tickets: string;
  spentLamports: string;
  wonLamports: string;
  bestWinLamports: string;
  resolvedPools: number;
  wins: number;
  pools: number;
  publicPools: number;
  privatePools: number;
  netPnLLamports: string;
  friends: number;
  flags: string[];
  hasProfile: boolean;
}

interface UsersPayload {
  rows: UserRow[];
  totals: {
    totalUsersWithProfile: number;
    totalUsersWithTickets: number;
    privateProfiles: number;
    publicProfiles: number;
    flaggedCount: number;
  };
  generatedAt: number;
}

type SortKey =
  | "spend"
  | "won"
  | "pools"
  | "wins"
  | "tickets"
  | "friends"
  | "created";
type ProfileFilter = "all" | "claimed" | "unclaimed";
type PrivacyFilter = "all" | "public" | "private";
type ActivityFilter = "all" | "tickets" | "pools" | "wins" | "heavy";
type SpendBucket = "all" | "0" | "0-1" | "1-10" | "10-100" | "100+";
type FlagFilter = "all" | "flagged";

const PAGE_SIZE = 25;
const LAMPORTS = 1_000_000_000n;

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Filters / sort.
  const [q, setQ] = useState("");
  const [profile, setProfile] = useState<ProfileFilter>("all");
  const [privacy, setPrivacy] = useState<PrivacyFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("pools");
  const [spend, setSpend] = useState<SpendBucket>("all");
  const [flags, setFlags] = useState<FlagFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/admin/users", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const payload = (await r.json()) as UsersPayload;
        if (!cancelled) {
          setData(payload);
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
    return data.rows.filter((u) => {
      if (needle) {
        const hay = `${u.pseudo ?? ""} ${u.xHandle ?? ""} ${u.wallet}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (profile === "claimed" && !u.hasProfile) return false;
      if (profile === "unclaimed" && u.hasProfile) return false;
      if (privacy === "public" && !u.isPublic) return false;
      if (privacy === "private" && u.isPublic) return false;
      if (activity === "tickets" && BigInt(u.tickets) === 0n) return false;
      if (activity === "pools" && u.pools === 0) return false;
      if (activity === "wins" && u.wins === 0) return false;
      if (activity === "heavy" && u.pools < 10) return false;
      if (spend !== "all") {
        const sol = Number(BigInt(u.spentLamports) / 1_000_000n) / 1000;
        switch (spend) {
          case "0":
            if (sol > 0) return false;
            break;
          case "0-1":
            if (sol === 0 || sol >= 1) return false;
            break;
          case "1-10":
            if (sol < 1 || sol >= 10) return false;
            break;
          case "10-100":
            if (sol < 10 || sol >= 100) return false;
            break;
          case "100+":
            if (sol < 100) return false;
            break;
        }
      }
      if (flags === "flagged" && u.flags.length === 0) return false;
      return true;
    });
  }, [data, q, profile, privacy, activity, spend, flags]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "spend":
          return cmpBig(BigInt(b.spentLamports), BigInt(a.spentLamports));
        case "won":
          return cmpBig(BigInt(b.wonLamports), BigInt(a.wonLamports));
        case "pools":
          return b.pools - a.pools;
        case "wins":
          return b.wins - a.wins;
        case "tickets":
          return cmpBig(BigInt(b.tickets), BigInt(a.tickets));
        case "friends":
          return b.friends - a.friends;
        case "created":
          return b.createdAtMs - a.createdAtMs;
      }
    });
    return copy;
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  if (err) {
    return (
      <main className="mx-auto max-w-7xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Users</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          Couldn&apos;t load users: {err}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Users
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            {data
              ? `${sorted.length} of ${data.rows.length} match · ${data.totals.flaggedCount} flagged · ${data.totals.totalUsersWithTickets} have on-chain activity`
              : "Loading…"}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 2 · client-side sort + filter
        </p>
      </div>

      {/* Filter row */}
      <section className="mt-6 grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 md:grid-cols-[1fr_auto_auto_auto_auto_auto_auto]">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Pseudo, X handle, or wallet…"
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 font-mono text-[12px] text-neutral-100 outline-none transition focus:border-neutral-600"
          aria-label="Filter users"
        />
        <FilterChips
          label="Profile"
          value={profile}
          onChange={(v) => {
            setProfile(v as ProfileFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "claimed", l: "CLAIMED" },
            { v: "unclaimed", l: "UNCLAIMED" },
          ]}
        />
        <FilterChips
          label="Privacy"
          value={privacy}
          onChange={(v) => {
            setPrivacy(v as PrivacyFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "public", l: "PUBLIC" },
            { v: "private", l: "PRIVATE 🔒" },
          ]}
        />
        <FilterChips
          label="Activity"
          value={activity}
          onChange={(v) => {
            setActivity(v as ActivityFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "tickets", l: "≥1 TICKET" },
            { v: "pools", l: "≥1 POOL" },
            { v: "wins", l: "WON ≥1" },
            { v: "heavy", l: "≥10 POOLS" },
          ]}
        />
        <FilterChips
          label="Spend (SOL)"
          value={spend}
          onChange={(v) => {
            setSpend(v as SpendBucket);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "0", l: "0" },
            { v: "0-1", l: "0–1" },
            { v: "1-10", l: "1–10" },
            { v: "10-100", l: "10–100" },
            { v: "100+", l: "100+" },
          ]}
        />
        <FilterChips
          label="Risk"
          value={flags}
          onChange={(v) => {
            setFlags(v as FlagFilter);
            setPage(1);
          }}
          options={[
            { v: "all", l: "ALL" },
            { v: "flagged", l: "FLAGGED" },
          ]}
          accentOn="coral"
        />
        <FilterChips
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={[
            { v: "spend", l: "SPEND ↓" },
            { v: "won", l: "WON ↓" },
            { v: "pools", l: "POOLS ↓" },
            { v: "wins", l: "WINS ↓" },
            { v: "tickets", l: "TICKETS ↓" },
            { v: "friends", l: "FRIENDS ↓" },
            { v: "created", l: "CREATED ↓" },
          ]}
        />
      </section>

      {/* Table */}
      <section className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              <th className="px-4 py-3">USER</th>
              <th className="px-4 py-3">STATUS</th>
              <th className="px-4 py-3 text-right">SPEND</th>
              <th className="px-4 py-3 text-right">WON</th>
              <th className="px-4 py-3 text-right">NET P&amp;L</th>
              <th className="px-4 py-3 text-right">POOLS</th>
              <th className="px-4 py-3 text-right">WINS</th>
              <th className="px-4 py-3 text-right">FRIENDS</th>
              <th className="px-4 py-3 text-right">CREATED</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  Loading…
                </td>
              </tr>
            )}
            {data && slice.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  No users match these filters
                </td>
              </tr>
            )}
            {slice.map((u) => (
              <UserTableRow key={u.wallet} u={u} />
            ))}
          </tbody>
        </table>
      </section>

      {/* Paginator */}
      {data && sorted.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span>
            SHOWING {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, sorted.length)} OF {sorted.length}
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

function UserTableRow({ u }: { u: UserRow }) {
  const netPnL = BigInt(u.netPnLLamports);
  const initial = (u.pseudo ?? u.wallet ?? "?").charAt(0).toUpperCase();
  return (
    <tr className="border-t border-dashed border-neutral-800 transition hover:bg-neutral-900/60">
      <td className="px-4 py-3">
        <Link
          href={`/admin/users/${u.wallet}`}
          className="flex min-w-0 items-center gap-3"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold"
            style={{
              background:
                "linear-gradient(135deg, #3f3f46, #18181b)",
              color: "#f5f5f5",
            }}
          >
            {initial}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">
              {u.pseudo ?? shortAddress(u.wallet)}
            </span>
            <span className="font-mono text-[10px] text-neutral-500">
              {u.pseudo ? shortAddress(u.wallet) : "no pseudo"}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        {!u.hasProfile ? (
          <Pill kind="neutral" label="UNCLAIMED" />
        ) : u.isPublic ? (
          <Pill kind="mint" label="PUBLIC" />
        ) : (
          <Pill kind="sand" label="PRIVATE 🔒" />
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums text-mint">
        {formatSol(BigInt(u.spentLamports))}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums text-neutral-100">
        {formatSol(BigInt(u.wonLamports))}
      </td>
      <td
        className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums"
        style={{
          color:
            netPnL > 0n ? MINT : netPnL < 0n ? CORAL : "#737373",
        }}
      >
        {netPnL > 0n ? "+" : ""}
        {formatSol(netPnL)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {u.pools}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {u.wins}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
        {u.friends}
      </td>
      <td className="px-4 py-3 text-right font-mono text-[10px] text-neutral-500">
        {u.createdAtMs ? new Date(u.createdAtMs).toISOString().slice(0, 10) : "—"}
      </td>
      <td className="px-4 py-3">
        {u.flags.length > 0 && (
          <Pill kind="coral" label={u.flags[0].replace(/_/g, " ")} />
        )}
      </td>
    </tr>
  );
}

function Pill({
  kind,
  label,
}: {
  kind: "mint" | "sand" | "coral" | "neutral";
  label: string;
}) {
  const style: React.CSSProperties =
    kind === "mint"
      ? {
          background: `${MINT}14`,
          borderColor: `${MINT}55`,
          color: MINT,
        }
      : kind === "sand"
        ? {
            background: `${SAND}14`,
            borderColor: `${SAND}55`,
            color: SAND,
          }
        : kind === "coral"
          ? {
              background: `${CORAL}1a`,
              borderColor: `${CORAL}55`,
              color: CORAL,
            }
          : {
              background: "#171717",
              borderColor: "#262626",
              color: "#737373",
            };
  return (
    <span
      className="inline-block rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
      style={style}
    >
      {label}
    </span>
  );
}

function FilterChips<T extends string>({
  label,
  value,
  onChange,
  options,
  accentOn,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ v: T; l: string }>;
  accentOn?: "coral";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.v === value;
          const style: React.CSSProperties =
            on && accentOn === "coral"
              ? {
                  background: `${CORAL}1a`,
                  borderColor: `${CORAL}55`,
                  color: CORAL,
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

function cmpBig(a: bigint, b: bigint): number {
  return a > b ? 1 : a < b ? -1 : 0;
}

// Touch unused vars to keep importer trimming honest (LAMPORTS is
// inlined elsewhere — kept here for future formatters).
void LAMPORTS;
void LAVENDER;

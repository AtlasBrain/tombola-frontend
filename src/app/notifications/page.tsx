"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header } from "@/components/Header";
import {
  clearAll,
  getNotifications,
  markAllRead,
  markRead,
  removeNotification,
  subscribeNotifications,
  type Notification,
  type NotificationKind,
} from "@/lib/notifications";
import { MINT } from "@/lib/colors";

const KIND_META: Record<NotificationKind, { glyph: string; color: string; label: string }> = {
  win:               { glyph: "🏆", color: "#88cfc4", label: "Wins" },
  purchase:          { glyph: "✓",  color: "#c9b5dc", label: "Purchases" },
  drawing:           { glyph: "◷",  color: "#e8d89e", label: "Drawing" },
  resolved:          { glyph: "✓",  color: "#737373", label: "Resolved" },
  created:           { glyph: "+",  color: "#88cfc4", label: "Created" },
  "fee-paid":        { glyph: "$",  color: "#e8d89e", label: "Fees" },
  redeemed:          { glyph: "✦",  color: "#e89999", label: "Redeemed" },
  invite:            { glyph: "🎟", color: "#88cfc4", label: "Pool invites" },
  "friend-request":  { glyph: "👤", color: "#c9b5dc", label: "Friends" },
  info:              { glyph: "i",  color: "#737373", label: "Info" },
};

type Filter = "all" | "unread" | NotificationKind;

function relativeTime(unix: number, nowSec: number): string {
  const dt = Math.max(0, nowSec - unix);
  if (dt < 60) return `${dt}s ago`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}

export default function NotificationsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [list, setList] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // Subscribe to the notification store. Push-driven (the listener
  // fires on every push/markRead/clear), plus a per-minute tick for
  // the relative-time renderer.
  useEffect(() => {
    if (!wallet) return;
    setList(getNotifications(wallet));
    const unsub = subscribeNotifications(wallet, () => {
      setList(getNotifications(wallet));
    });
    const tick = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      60_000,
    );
    return () => {
      unsub();
      clearInterval(tick);
    };
  }, [wallet]);

  const visible = useMemo(() => {
    if (filter === "all") return list;
    if (filter === "unread") return list.filter((n) => !n.read);
    return list.filter((n) => n.kind === filter);
  }, [list, filter]);

  const unread = list.filter((n) => !n.read).length;

  // Count by kind for filter chips that show 0 hide themselves.
  const kindCounts = useMemo(() => {
    const m = new Map<NotificationKind, number>();
    for (const n of list) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return m;
  }, [list]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest text-neutral-500 transition hover:text-neutral-300"
          >
            ← All pools
          </Link>
        </div>

        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
              Notifications
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              {wallet
                ? `${list.length} total · ${unread} unread`
                : "Connect a wallet to see your notifications"}
            </p>
          </div>
          {wallet && list.length > 0 && (
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead(wallet)}
                  className="rounded-full border border-neutral-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear every notification? This can't be undone.")) {
                    clearAll(wallet);
                  }
                }}
                className="rounded-full border border-neutral-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-rose-700/50 hover:text-rose-400"
              >
                Clear all
              </button>
            </div>
          )}
        </header>

        {/* Filter chips — only render kinds the user actually has. */}
        {wallet && list.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              count={list.length}
            >
              All
            </FilterChip>
            <FilterChip
              active={filter === "unread"}
              onClick={() => setFilter("unread")}
              count={unread}
              accent="#e8d89e"
            >
              Unread
            </FilterChip>
            {([...kindCounts.entries()] as Array<[NotificationKind, number]>)
              .sort((a, b) => b[1] - a[1])
              .map(([k, count]) => (
                <FilterChip
                  key={k}
                  active={filter === k}
                  onClick={() => setFilter(k)}
                  count={count}
                  accent={KIND_META[k]?.color}
                >
                  {KIND_META[k]?.label ?? k}
                </FilterChip>
              ))}
          </div>
        )}

        {/* Content */}
        {!wallet && (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center">
            <p className="font-display text-xl uppercase">No wallet connected</p>
            <p className="mt-2 text-sm text-neutral-500">
              Connect a wallet to view its notifications.
            </p>
          </div>
        )}
        {wallet && list.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center">
            <p className="font-display text-xl uppercase">All quiet</p>
            <p className="mt-2 text-sm text-neutral-500">
              No notifications yet. Friend requests, pool invites, and wins
              will show up here.
            </p>
          </div>
        )}
        {wallet && list.length > 0 && visible.length === 0 && (
          <p className="mt-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            No notifications match this filter.
          </p>
        )}
        {visible.length > 0 && (
          <ul className="mt-6 flex flex-col gap-2">
            {visible.map((n) => (
              <NotificationRow
                key={n.id}
                wallet={wallet!}
                note={n}
                nowSec={nowSec}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? { background: accent ?? MINT, color: "#000", borderColor: accent ?? MINT }
          : {}
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition ${
        active
          ? "font-bold"
          : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      }`}
    >
      <span>{children}</span>
      <span
        className={active ? "text-black/70" : "text-neutral-600"}
        style={{ fontWeight: 600 }}
      >
        {count}
      </span>
    </button>
  );
}

function NotificationRow({
  wallet,
  note,
  nowSec,
}: {
  wallet: string;
  note: Notification;
  nowSec: number;
}) {
  const meta = KIND_META[note.kind] ?? { glyph: "•", color: "#737373", label: "" };
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
        note.read
          ? "border-neutral-900 bg-neutral-950/40"
          : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{
          background: `${meta.color}1a`,
          color: meta.color,
          border: `1px solid ${meta.color}40`,
        }}
        aria-hidden
      >
        {meta.glyph}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {note.href ? (
          <Link
            href={note.href}
            onClick={() => markRead(wallet, note.id)}
            className={`truncate text-sm font-semibold transition hover:underline ${
              note.read ? "text-neutral-400" : "text-neutral-100"
            }`}
          >
            {note.title}
          </Link>
        ) : (
          <span
            className={`truncate text-sm font-semibold ${
              note.read ? "text-neutral-400" : "text-neutral-100"
            }`}
          >
            {note.title}
          </span>
        )}
        {note.body && (
          <span className="line-clamp-2 font-mono text-[11px] text-neutral-500">
            {note.body}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {relativeTime(note.createdAt, nowSec)}
        </span>
        {!note.read && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: MINT }}
          />
        )}
        <button
          type="button"
          onClick={() => removeNotification(wallet, note.id)}
          aria-label="Delete notification"
          className="rounded-full border border-neutral-800 px-2 py-0.5 font-mono text-[10px] text-neutral-500 transition hover:border-rose-700/50 hover:text-rose-400"
        >
          ×
        </button>
      </div>
    </li>
  );
}

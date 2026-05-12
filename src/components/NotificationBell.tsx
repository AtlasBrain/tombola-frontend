"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  clearAll,
  getNotifications,
  markAllRead,
  markRead,
  subscribeNotifications,
  type Notification,
  type NotificationKind,
} from "@/lib/notifications";

const KIND_META: Record<NotificationKind, { glyph: string; color: string }> = {
  win:      { glyph: "🏆", color: "#88cfc4" },
  purchase: { glyph: "✓",  color: "#c9b5dc" },
  drawing:  { glyph: "◷",  color: "#e8d89e" },
  resolved: { glyph: "✓",  color: "#737373" },
  created:  { glyph: "+",  color: "#88cfc4" },
  "fee-paid": { glyph: "$", color: "#e8d89e" },
  redeemed: { glyph: "✦",  color: "#E89999" },
  invite:   { glyph: "🎟", color: "#88cfc4" },
  "friend-request": { glyph: "👤", color: "#c9b5dc" },
  info:     { glyph: "i",  color: "#737373" },
};

function relativeTime(unix: number, nowSec: number): string {
  const dt = Math.max(0, nowSec - unix);
  if (dt < 60) return `${dt}s`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h`;
  return `${Math.floor(dt / 86400)}d`;
}

export function NotificationBell() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [list, setList] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Subscribe to the per-wallet notifications store. Refreshes the local
  // list whenever pushNotification / markRead / clearAll fires (or another
  // tab triggers a storage event).
  useEffect(() => {
    if (!wallet) {
      setList([]);
      return;
    }
    const refresh = () => setList(getNotifications(wallet));
    refresh();
    return subscribeNotifications(wallet, refresh);
  }, [wallet]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  const unread = list.filter((n) => !n.read).length;
  const hasAny = list.length > 0;

  const onToggle = useCallback(() => setOpen((v) => !v), []);
  const onClickItem = useCallback(
    (n: Notification) => {
      if (!wallet) return;
      markRead(wallet, n.id);
    },
    [wallet],
  );
  const onMarkAll = useCallback(() => {
    if (!wallet) return;
    markAllRead(wallet);
  }, [wallet]);
  const onClear = useCallback(() => {
    if (!wallet) return;
    clearAll(wallet);
  }, [wallet]);

  // Don't render the bell if no wallet — the inbox is per-wallet, an
  // unconnected visitor has nothing to see.
  if (!wallet) return null;

  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-label={
          unread > 0
            ? `${unread} unread notifications`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100 transition-colors hover:border-neutral-600"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 2c2.5 0 4 1.6 4 4v2.5l1.5 2H2.5l1.5-2V6c0-2.4 1.5-4 4-4z" />
          <path d="M6 12.5a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span
            className="pulse-soft absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-black"
            style={{ background: "#88cfc4" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-2xl border border-neutral-800 bg-neutral-950/95 shadow-2xl shadow-black/70 backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-900 px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Notifications {unread > 0 && `· ${unread} new`}
            </span>
            {hasAny && (
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAll}
                    className="text-neutral-400 hover:text-neutral-100"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  className="text-neutral-500 hover:text-rose-400"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!hasAny ? (
              <div className="px-4 py-10 text-center">
                <p className="font-display text-base uppercase">All clear</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  no notifications yet
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-900/60">
                {list.map((n) => {
                  const meta = KIND_META[n.kind];
                  const inner = (
                    <div className="flex gap-3">
                      <span
                        aria-hidden
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                        style={{
                          borderColor: `${meta.color}66`,
                          background: `${meta.color}1a`,
                          color: meta.color,
                        }}
                      >
                        {meta.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate font-display text-sm uppercase ${
                              n.read ? "text-neutral-400" : "text-neutral-100"
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-neutral-600">
                            {relativeTime(n.createdAt, nowSec)}
                          </span>
                        </div>
                        {n.body && (
                          <div className="mt-0.5 truncate text-xs text-neutral-500">
                            {n.body}
                          </div>
                        )}
                      </div>
                      {!n.read && (
                        <span
                          aria-hidden
                          className="ml-1 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "#88cfc4" }}
                        />
                      )}
                    </div>
                  );
                  const cls =
                    "block px-4 py-3 transition-colors hover:bg-neutral-900/60";
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          onClick={() => {
                            onClickItem(n);
                            setOpen(false);
                          }}
                          className={cls}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onClickItem(n)}
                          className={`w-full text-left ${cls}`}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* "View all" footer — opens the full /notifications page
                with filters, mark-read, delete. */}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-neutral-800 px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:text-neutral-100"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

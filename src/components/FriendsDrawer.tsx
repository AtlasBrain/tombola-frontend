"use client";

// Slide-in panel listing the profile owner's accepted friends.
// Triggered from the ProfileCard's "N FRIENDS ▸" pill.
//
// Reuses WalletLink so each row resolves wallet → pseudo via the
// session-wide pseudo-cache (no fetch storm when the drawer opens with
// 30 entries — they all share the cache).
//
// Closes on Esc or backdrop click. The list scrolls inside its own
// container if it overflows; the surrounding chrome stays put.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFriendLists } from "@/lib/friend-client";
import { usePseudo } from "@/lib/pseudo-cache";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { WalletLink } from "@/components/WalletLink";
import { shortAddress } from "@/lib/format";

const MINT = "#88cfc4";

interface Props {
  /** Profile owner's wallet — the friend list to display. */
  wallet: string;
  open: boolean;
  onClose: () => void;
}

export function FriendsDrawer({ wallet, open, onClose }: Props) {
  const [filter, setFilter] = useState("");

  const friendsQuery = useQuery({
    enabled: open,
    queryKey: ["friends", wallet, null],
    // Same cache key shape useProfileData uses so the drawer reuses an
    // already-fetched friend list when the user opened the drawer from a
    // profile card on this page.
    queryFn: async () => {
      const lists = await getFriendLists(wallet);
      return { relationship: null, lists };
    },
  });

  // Esc-to-close. Capturing on window so the listener works regardless of
  // where focus sits when the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const friends = friendsQuery.data?.lists.friends ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return friends;
    // Filter accepts pseudo OR wallet prefix. Wallet match is exact-prefix
    // on the raw base58 so creators can paste a known address.
    return friends.filter((w) => w.toLowerCase().includes(q));
  }, [friends, filter]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Friends list"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // Slide-from-right panel. Width capped so on wide screens it
        // stays a side drawer rather than splitting the page.
        className="flex h-full w-full max-w-[360px] flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/60"
      >
        <header
          className="flex items-center justify-between border-b border-neutral-800 px-4 py-3"
          style={{ color: MINT }}
        >
          <span className="font-mono text-[11px] uppercase tracking-widest">
            FRIENDS · {friends.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close friends list"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-300 transition hover:border-neutral-600"
          >
            ×
          </button>
        </header>

        <div className="border-b border-neutral-800 px-4 py-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter friends…"
              aria-label="Filter friends"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-8 py-2 text-xs text-neutral-100 outline-none transition focus:border-neutral-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {friendsQuery.isLoading && (
            <p className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Loading…
            </p>
          )}
          {friendsQuery.error && (
            <p className="px-3 py-6 text-center text-xs text-rose-400">
              Couldn’t load friends list.
            </p>
          )}
          {!friendsQuery.isLoading &&
            !friendsQuery.error &&
            friends.length === 0 && (
              <p className="px-3 py-10 text-center text-xs text-neutral-500">
                No friends yet — try the search palette to find someone.
              </p>
            )}
          {!friendsQuery.isLoading &&
            friends.length > 0 &&
            filtered.length === 0 && (
              <p className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                No matches
              </p>
            )}
          {filtered.map((friendWallet) => (
            <FriendRow key={friendWallet} wallet={friendWallet} onNavigate={onClose} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FriendRow({
  wallet,
  onNavigate,
}: {
  wallet: string;
  onNavigate: () => void;
}) {
  const pseudo = usePseudo(wallet);
  const initial = (pseudo ?? wallet ?? "?").charAt(0).toUpperCase();
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-neutral-900">
      <WalletIdenticon wallet={wallet} size={40} initialOverride={initial} />
      <span className="flex min-w-0 flex-1 flex-col">
        <WalletLink
          wallet={wallet}
          className="truncate text-[13px] font-semibold text-neutral-100"
        />
        <span className="font-mono text-[10px] text-neutral-500">
          {pseudo ? shortAddress(wallet) : "no pseudo"}
        </span>
      </span>
      <span
        className="font-mono text-[9px] uppercase tracking-widest text-neutral-700 transition group-hover:text-neutral-400"
        aria-hidden
        onClick={onNavigate}
      >
        ▸
      </span>
    </div>
  );
}

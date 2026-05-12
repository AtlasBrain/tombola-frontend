"use client";

// Reusable list of the caller's accepted friends with selection state.
// Used in two places:
//   1. CreatePoolForm — FRIENDS access mode: pick initial seats at
//      creation time.
//   2. CreatePoolModal success / admin page: pick additional friends to
//      allocate remaining codes to after creation.
//
// Loads the caller's accepted-friends list via the existing
// /api/friends/[wallet] endpoint (react-query cached). Filter input
// matches against the friend's pseudo (if cached) OR raw wallet
// substring. Selected wallets are exposed via `value` / `onChange` so
// the parent controls how many can be picked (e.g. "max 8 codes
// remaining").
//
// Honors a `disabledWallets` set so we can mark friends who already
// have an outstanding invite for this pool — keeps the UI honest
// without re-loading the picker.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFriendLists } from "@/lib/friend-client";
import { usePseudo } from "@/lib/pseudo-cache";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { shortAddress } from "@/lib/format";

const MINT = "#88cfc4";

interface Props {
  /** Caller's wallet — drives which friends list we fetch. */
  caller: string;
  /** Currently selected friend wallets. Lifted state. */
  value: string[];
  /** Setter for selection. */
  onChange: (next: string[]) => void;
  /** Cap on how many can be selected. When undefined, unlimited. */
  maxSelected?: number;
  /** Friends to render as disabled (e.g. already invited). */
  disabledWallets?: Set<string>;
  /** Empty-state message when the caller has no friends. */
  emptyHint?: string;
  /** Tighter vertical density for narrow surfaces. */
  compact?: boolean;
}

export function FriendPicker({
  caller,
  value,
  onChange,
  maxSelected,
  disabledWallets,
  emptyHint,
  compact,
}: Props) {
  const [filter, setFilter] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const disabled = disabledWallets ?? new Set<string>();

  const friendsQuery = useQuery({
    enabled: !!caller,
    queryKey: ["friends", caller, null],
    queryFn: async () => {
      const lists = await getFriendLists(caller);
      return lists;
    },
  });

  const friends = useMemo(
    () => friendsQuery.data?.friends ?? [],
    [friendsQuery.data],
  );

  // Filter against the raw wallet substring + each row's resolved
  // pseudo. The pseudo lookup is a per-row hook so the filter respects
  // the session pseudo cache — see FriendRow below.
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((w) => w.toLowerCase().includes(q));
  }, [friends, filter]);

  const atCap =
    maxSelected !== undefined && selected.size >= maxSelected;

  function toggle(wallet: string) {
    if (disabled.has(wallet)) return;
    if (selected.has(wallet)) {
      onChange(value.filter((w) => w !== wallet));
    } else {
      if (atCap) return;
      onChange([...value, wallet]);
    }
  }

  if (friendsQuery.isLoading) {
    return (
      <p className="px-2 py-6 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Loading friends…
      </p>
    );
  }

  if (friendsQuery.error) {
    return (
      <p className="px-2 py-6 text-center text-xs text-rose-400">
        Couldn’t load your friends list.
      </p>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          No friends yet
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {emptyHint ??
            "Use the ⌘K search to find someone, then send a friend request from their profile."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter your ${friends.length} friend${friends.length === 1 ? "" : "s"}…`}
          aria-label="Filter friends"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-8 py-2 text-xs text-neutral-100 outline-none transition focus:border-neutral-600"
        />
      </div>

      {maxSelected !== undefined && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {selected.size} of {maxSelected} selected
        </p>
      )}

      <div className={`flex flex-col gap-${compact ? "1" : "1.5"}`}>
        {visible.length === 0 && (
          <p className="px-2 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            No matches
          </p>
        )}
        {visible.map((w) => (
          <FriendRow
            key={w}
            wallet={w}
            selected={selected.has(w)}
            disabled={disabled.has(w)}
            atCap={!selected.has(w) && atCap}
            onToggle={() => toggle(w)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

function FriendRow({
  wallet,
  selected,
  disabled,
  atCap,
  onToggle,
  compact,
}: {
  wallet: string;
  selected: boolean;
  disabled: boolean;
  atCap: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const pseudo = usePseudo(wallet);
  const initial = (pseudo ?? wallet ?? "?").charAt(0).toUpperCase();
  const inactive = disabled || atCap;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      title={
        disabled
          ? "Already invited to this pool"
          : atCap
            ? "Maximum reached"
            : selected
              ? "Click to unselect"
              : "Click to select"
      }
      className={`flex w-full items-center gap-3 rounded-lg border px-3 ${
        compact ? "py-1.5" : "py-2"
      } text-left transition ${
        selected
          ? "border-[color:var(--mint,#88cfc4)] bg-[color:var(--mint-soft,rgba(136,207,196,0.06))]"
          : inactive
            ? "border-neutral-900 bg-neutral-900/20 opacity-60"
            : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
      } disabled:cursor-not-allowed`}
      style={
        selected
          ? {
              borderColor: MINT,
              background: `${MINT}10`,
            }
          : undefined
      }
    >
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2"
        aria-hidden
        style={{
          borderColor: selected ? MINT : "#3f3f46",
          background: selected ? MINT : "transparent",
          color: "#000",
          fontSize: "11px",
          fontWeight: 700,
        }}
      >
        {selected ? "✓" : ""}
      </span>
      <WalletIdenticon
        wallet={wallet}
        size={compact ? 28 : 32}
        initialOverride={initial}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-neutral-100">
          {pseudo ?? shortAddress(wallet)}
        </span>
        {pseudo && (
          <span className="font-mono text-[10px] text-neutral-500">
            {shortAddress(wallet)}
          </span>
        )}
      </span>
      {disabled && (
        <span
          className="font-mono text-[9px] uppercase tracking-widest"
          style={{ color: "#e8d89e" }}
        >
          INVITED
        </span>
      )}
    </button>
  );
}

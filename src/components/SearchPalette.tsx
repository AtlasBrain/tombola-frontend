"use client";

// ⌘K / `/` palette — global search for users by pseudo OR raw wallet.
// Renders as a fixed-position dialog with a backdrop. Open/close is
// controlled by the parent (Header). Enter on a result navigates to
// /u/<pseudo-or-wallet>.
//
// UX details:
//   - 150ms debounce on the query so we don't fire a request per keystroke
//   - Aborts the previous in-flight fetch when a new one starts
//   - Keyboard nav (↑/↓, Enter, Esc)
//   - Privacy: results carry isPublic so we can render a 🔒 hint without
//     exposing private fields
//   - When the query EXACTLY matches the base58 wallet shape, we surface
//     a single wallet result even if there's no stored profile (so the
//     user can navigate to that wallet's page directly)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchUsers, type UserSearchResult } from "@/lib/user-search-client";
import { shortAddress } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MINT = "#88cfc4";
const DEBOUNCE_MS = 150;

export function SearchPalette({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Focus the input on open + reset state on close. The native dialog API
  // would do this for us but a plain div lets us keep the focus-trap
  // simple and matches the rest of the app's modal patterns.
  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setError(null);
      setSelectedIdx(0);
      // requestAnimationFrame so the input is mounted before .focus()
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search with abort. Re-runs whenever the query changes.
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchUsers(q, controller.signal);
        setResults(rows);
        setSelectedIdx(0);
        setError(null);
      } catch (e) {
        // AbortError is expected when the user types again before this
        // call returns — swallow silently. Other errors surface.
        if ((e as { name?: string }).name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q, open]);

  function navigateTo(r: UserSearchResult) {
    const target = r.pseudo ?? r.wallet;
    router.push(`/u/${encodeURIComponent(target)}`);
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[selectedIdx];
      if (picked) navigateTo(picked);
    }
  }

  if (!open) return null;

  return (
    <div
      // Backdrop catches clicks outside the panel.
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[15vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search users"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="w-full max-w-[560px] rounded-2xl border border-neutral-800 bg-neutral-950/95 p-2 shadow-2xl shadow-black/60"
      >
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            width="14"
            height="14"
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
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search players, pseudos, wallets…"
            aria-label="Search query"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-9 py-2.5 text-sm text-neutral-100 outline-none transition focus:border-neutral-600"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Status row */}
        <div className="px-3 pt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          {error ? (
            <span className="text-rose-400">{error}</span>
          ) : loading ? (
            "searching…"
          ) : q.trim() === "" ? (
            <>
              start typing a pseudo or paste a wallet —{" "}
              <kbd className="rounded border border-neutral-800 px-1.5 py-0.5 text-[9px]">
                esc
              </kbd>{" "}
              to close
            </>
          ) : results.length === 0 ? (
            "no results"
          ) : (
            `${results.length} result${results.length === 1 ? "" : "s"}`
          )}
        </div>

        {results.length > 0 && (
          <div
            className="mt-2 max-h-[60vh] overflow-y-auto px-1"
            role="listbox"
            aria-label="Search results"
          >
            {results.map((r, i) => {
              const selected = i === selectedIdx;
              const initial = (r.pseudo ?? r.wallet ?? "?")
                .charAt(0)
                .toUpperCase();
              return (
                <button
                  key={r.wallet}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => navigateTo(r)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                    selected ? "bg-neutral-900" : ""
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, #3f3f46, #18181b)",
                      color: "#f5f5f5",
                    }}
                  >
                    {initial}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-neutral-100">
                      {r.pseudo ? (
                        <>
                          {r.pseudo}
                          {!r.isPublic && (
                            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                              🔒 private
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-mono text-[12px] text-neutral-200">
                          {shortAddress(r.wallet)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">
                      {r.pseudo ? shortAddress(r.wallet) : "no pseudo claimed"}
                    </span>
                  </span>
                  <span
                    className="ml-auto font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: selected ? MINT : "#525252" }}
                  >
                    {selected ? "↵" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Keyboard-shortcut footer */}
        <div className="mt-2 flex items-center justify-between px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-neutral-600">
          <span>
            <kbd className="rounded border border-neutral-800 px-1.5 py-0.5">↑↓</kbd>{" "}
            navigate ·{" "}
            <kbd className="rounded border border-neutral-800 px-1.5 py-0.5">↵</kbd>{" "}
            open
          </span>
          <span>powered by /api/users/search</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { editProfile, type ProfileRow } from "@/lib/profile-client";
import { invalidatePseudo } from "@/lib/pseudo-cache";

interface Props {
  /** Current profile loaded from /api/profile/[handle]. Pre-fills the form. */
  initial: ProfileRow;
  /** Called after a successful save with the new profile row. The parent
   *  page typically refetches or just merges this row into its state. */
  onSaved: (next: ProfileRow) => void;
  onClose: () => void;
}

const PSEUDO_RE = /^[a-z0-9_]{3,24}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/** Modal for editing the connected wallet's own profile. Only the connected
 *  wallet sees an "Edit profile" button (the page enforces that) — this
 *  modal trusts that and proves identity via wallet signature on save. */
export function EditProfileModal({ initial, onSaved, onClose }: Props) {
  const { publicKey, signMessage } = useWallet();
  const [pseudo, setPseudo] = useState(initial.pseudo ?? "");
  const [xHandle, setXHandle] = useState(initial.xHandle ?? "");
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Focus first field on mount + close on Escape.
  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pseudoValid =
    pseudo === "" || PSEUDO_RE.test(pseudo.toLowerCase());
  const xHandleValid = xHandle === "" || X_HANDLE_RE.test(xHandle);

  async function save() {
    setErr(null);
    if (!publicKey || !signMessage) {
      setErr("Connect a wallet that supports signMessage (Phantom, Solflare).");
      return;
    }
    if (!pseudoValid) {
      setErr("Pseudo must be 3–24 chars of letters, digits, or underscore.");
      return;
    }
    if (!xHandleValid) {
      setErr("X handle must be 1–15 chars (letters, digits, or _).");
      return;
    }
    setBusy(true);
    try {
      const next = await editProfile({
        wallet: publicKey.toBase58(),
        signMessage,
        patch: {
          pseudo: pseudo.trim() === "" ? null : pseudo.trim().toLowerCase(),
          xHandle: xHandle.trim() === "" ? null : xHandle.trim(),
          isPublic,
        },
      });
      // Pseudo (and avatar) might have changed — flush any cached
      // wallet→pseudo lookup so other components on the page refresh
      // their displayed label immediately.
      invalidatePseudo(next.wallet);
      onSaved(next);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl uppercase tracking-tight">
          Edit profile
        </h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Signed by your wallet — no password
        </p>

        {/* Pseudo */}
        <label className="mt-5 block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Pseudo
          </span>
          <input
            ref={firstFieldRef}
            type="text"
            value={pseudo}
            onChange={(e) =>
              setPseudo(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, 24),
              )
            }
            placeholder="e.g. marwan"
            className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-[#88cfc4]/40 focus:ring-2 focus:ring-[#88cfc4]/20"
            disabled={busy}
          />
          {!pseudoValid && (
            <p className="mt-1 text-xs text-rose-400">
              3–24 chars, lowercase letters / digits / underscore.
            </p>
          )}
        </label>

        {/* X handle */}
        <label className="mt-4 block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            X handle
          </span>
          <div className="mt-1.5 flex items-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 focus-within:border-[#88cfc4]/40 focus-within:ring-2 focus-within:ring-[#88cfc4]/20 transition">
            <span className="font-mono text-neutral-500">@</span>
            <input
              type="text"
              value={xHandle}
              onChange={(e) =>
                setXHandle(
                  e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 15),
                )
              }
              placeholder="marwan"
              className="w-full bg-transparent py-2 pl-1 text-sm text-neutral-100 outline-none"
              disabled={busy}
            />
          </div>
          {!xHandleValid && (
            <p className="mt-1 text-xs text-rose-400">
              X handles are 1–15 chars, letters / digits / underscore.
            </p>
          )}
        </label>

        {/* Privacy toggle */}
        <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              Profile visibility
            </p>
            <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
              {isPublic
                ? "Public — anyone can see your stats, wins, activity, and badges."
                : "Private — only your pseudo, avatar, wallet, and the friend-request button are shown."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            disabled={busy}
            role="switch"
            aria-checked={isPublic}
            aria-label="Toggle profile visibility"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              isPublic ? "bg-[#88cfc4]" : "bg-neutral-700"
            }`}
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-black transition-transform"
              style={{ transform: `translateX(${isPublic ? "20px" : "0px"})` }}
            />
          </button>
        </div>

        {err && (
          <p className="mt-3 rounded-lg border border-rose-700/40 bg-rose-900/20 p-2 text-xs text-rose-300">
            {err}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-neutral-800 px-4 py-2 font-mono text-xs uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !pseudoValid || !xHandleValid}
            className="rounded-full bg-[#88cfc4] px-5 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Signing…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

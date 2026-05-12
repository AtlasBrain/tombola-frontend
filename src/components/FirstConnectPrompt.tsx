"use client";

// One-shot onboarding card that surfaces the first time a wallet
// connects without a claimed pseudo. Non-blocking — sits at the
// bottom-right of the viewport with a "Set up profile" CTA and a
// Skip button.
//
// State lives in localStorage per wallet so re-connecting the same
// wallet on the same browser doesn't re-show. Different wallet on
// the same browser = different prompt; sensible since profile state
// is wallet-scoped.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchProfile } from "@/lib/profile-client";

const MINT = "#88cfc4";

function dismissKey(wallet: string): string {
  return `tombola.firstConnectDismissed.${wallet}`;
}

function alreadyDismissed(wallet: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(dismissKey(wallet)) === "1";
}

function markDismissed(wallet: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dismissKey(wallet), "1");
  } catch {
    // Quota / private mode — best effort. Worst case: prompt re-fires
    // on next page load.
  }
}

export function FirstConnectPrompt() {
  const { publicKey } = useWallet();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setVisible(false);
      return;
    }
    const wallet = publicKey.toBase58();
    if (alreadyDismissed(wallet)) return;

    let cancelled = false;
    (async () => {
      try {
        const row = await fetchProfile(wallet);
        if (cancelled) return;
        if (row?.pseudo) {
          // Already set up — silently mark dismissed so we never
          // re-check on this wallet.
          markDismissed(wallet);
          return;
        }
        setVisible(true);
      } catch {
        // Network blip — don't dismiss; retry on next connect.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!publicKey || !visible) return null;
  const wallet = publicKey.toBase58();

  function dismiss() {
    markDismissed(wallet);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Set up your profile"
      className="fixed bottom-4 right-4 z-40 w-[min(92vw,360px)] rounded-2xl border bg-neutral-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-sm"
      style={{ borderColor: `${MINT}55` }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
          style={{ background: `${MINT}26`, color: MINT }}
          aria-hidden
        >
          👋
        </span>
        <div className="flex-1">
          <h3 className="font-display text-base uppercase tracking-tight text-neutral-100">
            Welcome to Tombola
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Claim a pseudo and avatar so friends can find you, and your
            wins show up with your name instead of a raw wallet.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full border border-neutral-800 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
        >
          Skip
        </button>
        <Link
          href={`/u/${wallet}`}
          onClick={dismiss}
          style={{ background: MINT, color: "#000" }}
          className="rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-110"
        >
          Set up profile →
        </Link>
      </div>
    </div>
  );
}

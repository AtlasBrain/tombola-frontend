"use client";

// Surfaces a "you need devnet SOL to play" hint when the connected
// wallet has zero balance. Renders once at the top of any page that
// mounts it; dismissible per session so it doesn't nag once the user
// has acknowledged.
//
// On mainnet rotation this can flip to a "buy/bridge SOL" hint —
// the trigger condition (wallet has 0 lamports) is identical.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

const MINT = "#88cfc4";
const SESSION_DISMISS_KEY = "tombola.zeroBalanceBannerDismissed";

export function ZeroBalanceBanner() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        if (!cancelled) setBalance(lamports);
      } catch {
        // Network blip — leave null so we don't surface the banner on
        // bad data. The next mount will retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  function dismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    }
  }

  if (!publicKey) return null;
  if (dismissed) return null;
  if (balance === null) return null;
  if (balance > 0) return null;

  return (
    <div
      role="region"
      aria-label="Zero balance hint"
      className="mx-auto mt-4 flex max-w-7xl items-center gap-3 rounded-2xl border px-4 py-3"
      style={{
        borderColor: `${MINT}55`,
        background: `linear-gradient(135deg, ${MINT}1a, ${MINT}05 60%, transparent)`,
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-base"
        style={{ background: `${MINT}26`, color: MINT }}
        aria-hidden
      >
        ⛽
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-neutral-100">No SOL in this wallet</p>
        <p className="font-mono text-[11px] text-neutral-400">
          You&apos;ll need devnet SOL to buy tickets. Get some from the faucet —
          one minute, no signups.
        </p>
      </div>
      <Link
        href="/claim/DEVNET"
        style={{ background: MINT, color: "#000" }}
        className="shrink-0 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-110"
      >
        Get SOL
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full border border-neutral-800 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
      >
        ×
      </button>
    </div>
  );
}

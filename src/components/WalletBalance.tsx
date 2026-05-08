"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { formatSolCompact } from "@/lib/format";

const POLL_INTERVAL_MS = 10_000;

export function WalletBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [lamports, setLamports] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setLamports(null);
      return;
    }
    let cancelled = false;

    async function refresh() {
      if (!publicKey) return;
      try {
        const bal = await connection.getBalance(publicKey);
        if (!cancelled) setLamports(BigInt(bal));
      } catch {
        // network blip — keep showing the last-known value
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, publicKey]);

  if (!publicKey || lamports === null) return null;

  return (
    <span
      title={`${publicKey.toBase58()} — ${lamports} lamports`}
      className="inline-flex items-center rounded-full bg-neutral-500/10 px-2.5 py-1 text-xs font-medium tabular-nums text-neutral-300 ring-1 ring-inset ring-neutral-500/20"
    >
      {formatSolCompact(lamports)}
    </span>
  );
}

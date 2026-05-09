"use client";
import { use, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { Header } from "@/components/Header";
import { Countdown } from "@/components/Countdown";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { BuyTicketPrivateButton } from "@/components/BuyTicketPrivateButton";
import { DrawWinnerButton } from "@/components/DrawWinnerButton";
import { formatSol, formatTickets } from "@/lib/format";

interface PoolData {
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creator: string;
  creatorFeeBps: number;
  winner: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accessModeLabel(am: any): "Whitelist" | "OneCodePerTicket" {
  if (typeof am === "number") {
    return am === 0 ? "Whitelist" : "OneCodePerTicket";
  }
  if (am && typeof am === "object" && "__kind" in am) {
    return am.__kind === "WhitelistMode" ? "Whitelist" : "OneCodePerTicket";
  }
  return "Whitelist";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapWinner(w: any): string | null {
  if (!w) return null;
  if (typeof w === "object" && "__option" in w) {
    return w.__option === "Some" ? String(w.value) : null;
  }
  return String(w);
}

export default function PrivatePoolPage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = use(params);
  const { connection } = useConnection();
  const [pool, setPool] = useState<PoolData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        const acc = await fetchPrivatePool(rpc, pubkey as Address);
        if (cancelled) return;
        setPool({
          ticketPriceLamports: acc.data.ticketPrice,
          totalTickets: acc.data.totalTickets,
          totalPotLamports: acc.data.totalPot,
          closeTimeUnix: Number(acc.data.closeTime),
          state: acc.data.state as 0 | 1 | 2,
          accessMode: accessModeLabel(acc.data.accessMode),
          creator: String(acc.data.creator),
          creatorFeeBps: acc.data.creatorFeeBps,
          winner: unwrapWinner(acc.data.winner),
        });
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load pool");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, pubkey]);

  if (err) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="font-display text-3xl uppercase">Pool not found</h1>
          <p className="mt-4 text-sm text-neutral-400">{err}</p>
        </main>
      </>
    );
  }
  if (!pool) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-neutral-400">Loading…</p>
        </main>
      </>
    );
  }

  const closed = pool.state !== 0 || pool.closeTimeUnix * 1000 <= Date.now();

  return (
    <>
      <Header />
      <LivePoolWatcher addresses={[pubkey]} rpcUrl={connection.rpcEndpoint} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              Private pool · {pool.accessMode}
            </p>
            <h1 className="mt-1 font-mono text-xl text-neutral-300">
              {pubkey.slice(0, 8)}…{pubkey.slice(-4)}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              Creator: {pool.creator.slice(0, 8)}…{pool.creator.slice(-4)} · fee{" "}
              {(pool.creatorFeeBps / 100).toFixed(1)}%
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs ring-1 ${
              pool.state === 0
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                : pool.state === 1
                  ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                  : "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20"
            }`}
          >
            {pool.state === 0
              ? "Open"
              : pool.state === 1
                ? "Drawing…"
                : "Resolved"}
          </span>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Pot" value={formatSol(pool.totalPotLamports)} />
          <Stat label="Tickets" value={formatTickets(pool.totalTickets)} />
          <Stat
            label={pool.state === 0 ? "Closes in" : "Closed"}
            value={<Countdown targetUnix={pool.closeTimeUnix} />}
          />
        </div>

        {pool.state === 2 && pool.winner && (
          <div className="mt-8 rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-6">
            <p className="text-xs uppercase tracking-widest text-emerald-400">
              Winner
            </p>
            <p className="mt-1 font-mono text-sm text-neutral-200">
              {pool.winner}
            </p>
          </div>
        )}

        {pool.accessMode === "Whitelist" && (
          <BuyTicketPrivateButton
            poolAddress={pubkey}
            ticketPriceLamports={pool.ticketPriceLamports}
            closed={closed}
          />
        )}

        <DrawWinnerButton
          poolAddress={pubkey}
          state={pool.state}
          closeTimeUnix={pool.closeTimeUnix}
          totalTickets={pool.totalTickets}
          creator={pool.creator}
        />
      </main>
    </>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-100">{value}</div>
    </div>
  );
}

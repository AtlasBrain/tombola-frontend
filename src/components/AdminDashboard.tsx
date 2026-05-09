"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { createSolanaRpc, type Address } from "@solana/kit";
import { LivePoolWatcher } from "./LivePoolWatcher";
import { AdminDashboardStats } from "./AdminDashboardStats";
import { AdminRedemptionStatus } from "./AdminRedemptionStatus";

interface Props {
  poolAddress: string;
}

interface PoolData {
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creator: string;
  creatorFeeBps: number;
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

export function AdminDashboard({ poolAddress }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [pool, setPool] = useState<PoolData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        const acc = await fetchPrivatePool(rpc, poolAddress as Address);
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
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load pool");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, poolAddress]);

  if (err) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Pool not found</h1>
        <p className="mt-4 text-sm text-neutral-400">{err}</p>
      </main>
    );
  }
  if (!pool) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-neutral-400">Loading…</p>
      </main>
    );
  }
  if (!publicKey) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Admin dashboard</h1>
        <p className="mt-4 text-sm text-neutral-400">
          Connect your wallet to view this dashboard.
        </p>
        <button
          type="button"
          onClick={() => setWalletModalVisible(true)}
          className="mt-6 rounded bg-emerald-600 px-6 py-3 font-semibold text-white"
        >
          Connect wallet
        </button>
      </main>
    );
  }
  if (publicKey.toBase58() !== pool.creator) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Not the creator</h1>
        <p className="mt-4 text-sm text-neutral-400">
          Only the wallet that created this pool can view its admin dashboard.
        </p>
        <Link
          href={`/pool/private/${poolAddress}`}
          className="mt-6 inline-flex rounded bg-neutral-800 px-6 py-3 text-sm font-semibold text-neutral-100 hover:bg-neutral-700"
        >
          Open buyer view →
        </Link>
      </main>
    );
  }

  return (
    <>
      <LivePoolWatcher addresses={[poolAddress]} rpcUrl={connection.rpcEndpoint} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              Admin · {pool.accessMode}
            </p>
            <h1 className="mt-1 font-mono text-xl text-neutral-300">
              {poolAddress.slice(0, 8)}…{poolAddress.slice(-4)}
            </h1>
          </div>
          <Link
            href={`/pool/private/${poolAddress}`}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            View as buyer →
          </Link>
        </div>

        <div className="mt-8">
          <AdminDashboardStats
            totalPotLamports={pool.totalPotLamports}
            totalTickets={pool.totalTickets}
            closeTimeUnix={pool.closeTimeUnix}
            creatorFeeBps={pool.creatorFeeBps}
            state={pool.state}
          />
        </div>

        <div className="mt-8">
          <AdminRedemptionStatus
            poolAddress={poolAddress}
            walletAddress={publicKey.toBase58()}
          />
        </div>
        {/* Section 6 (TopBuyersBar + ParticipantList) lands in Task 6 */}
      </main>
    </>
  );
}

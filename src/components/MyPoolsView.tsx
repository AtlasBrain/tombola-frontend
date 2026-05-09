"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { PROGRAM_ID } from "@tombola/sdk";
import { findMyPrivatePools } from "@/lib/private-pools";
import { PrivatePoolCard } from "./PrivatePoolCard";

interface PoolRow {
  poolAddress: string;
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
}

export function MyPoolsView() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [pools, setPools] = useState<PoolRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await findMyPrivatePools({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          walletAddress: publicKey.toBase58(),
        });
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const rows: PoolRow[] = [];
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        for (const { address } of found) {
          const pool = await fetchPrivatePool(rpc, address as Address);
          rows.push({
            poolAddress: String(address),
            ticketPriceLamports: pool.data.ticketPrice,
            totalTickets: pool.data.totalTickets,
            totalPotLamports: pool.data.totalPot,
            closeTimeUnix: Number(pool.data.closeTime),
            state: pool.data.state as 0 | 1 | 2,
            accessMode: accessModeLabel(pool.data.accessMode),
          });
        }
        if (!cancelled) setPools(rows);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  if (!publicKey) {
    return (
      <p className="text-sm text-neutral-400">
        Connect your wallet to see pools you&apos;ve created.
      </p>
    );
  }
  if (err) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Couldn&apos;t load your pools: {err}
      </p>
    );
  }
  if (pools === null) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }
  if (pools.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        You haven&apos;t created any private pools yet.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {pools.map((p) => (
        <PrivatePoolCard key={p.poolAddress} {...p} />
      ))}
    </div>
  );
}

// AccessMode is a numeric enum on the on-chain side. Codama may emit it as a
// number, a tagged union, or an enum constant — handle whatever shape comes
// out by inspecting the value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accessModeLabel(am: any): "Whitelist" | "OneCodePerTicket" {
  if (typeof am === "number") {
    return am === 0 ? "Whitelist" : "OneCodePerTicket";
  }
  if (am && typeof am === "object" && "__kind" in am) {
    return am.__kind === "WhitelistMode" ? "Whitelist" : "OneCodePerTicket";
  }
  // Fallback for other generated shapes — Whitelist is the safer default to
  // surface the buy button (gated by the on-chain Whitelisted PDA check).
  return "Whitelist";
}

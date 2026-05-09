"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";
import { findMyPrivatePools } from "@/lib/private-pools";
import { formatSol } from "@/lib/format";

interface PoolRow {
  poolAddress: string;
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  openTimeUnix: number;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creatorFeeBps: number;
  /** Distinct TicketBatch.owner count for this pool. Set after the per-pool
   *  batches fetch completes; null while still loading. */
  participants: number | null;
  /** Aggregate creator-fee accrual on this pool — totalPot * fee / 10_000.
   *  Earnings are paid at settle, so for Open / AwaitingVrf pools this is
   *  the *pending* amount (the pot can still grow). */
  feeLamports: bigint;
}

const TICKET_BATCH_SIZE = 89n;
const POOL_OFFSET = 8n;

function feeFor(totalPot: bigint, feeBps: number): bigint {
  return (totalPot * BigInt(feeBps)) / 10_000n;
}

function durationLabel(openSec: number, closeSec: number): string {
  const secs = Math.max(0, closeSec - openSec);
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(secs / 60)}m`;
}

function statusLabel(
  state: 0 | 1 | 2,
  closeTimeUnix: number,
): { label: string; cls: string } {
  if (state === 2)
    return {
      label: "Resolved",
      cls: "bg-neutral-500/10 text-neutral-400 ring-neutral-500/20",
    };
  if (state === 1)
    return {
      label: "Drawing",
      cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    };
  if (closeTimeUnix * 1000 <= Date.now())
    return {
      label: "Closed",
      cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    };
  return {
    label: "Open",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  };
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
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");

        // First pass: pool data only. Render the table immediately so the
        // creator sees something while batch counts come in.
        const baseRows = await Promise.all(
          found.map(async ({ address }) => {
            const pool = await fetchPrivatePool(rpc, address as Address);
            const feeLamports = feeFor(
              pool.data.totalPot,
              pool.data.creatorFeeBps,
            );
            const row: PoolRow = {
              poolAddress: String(address),
              ticketPriceLamports: pool.data.ticketPrice,
              totalTickets: pool.data.totalTickets,
              totalPotLamports: pool.data.totalPot,
              openTimeUnix: Number(pool.data.openTime),
              closeTimeUnix: Number(pool.data.closeTime),
              state: pool.data.state as 0 | 1 | 2,
              accessMode: accessModeLabel(pool.data.accessMode),
              creatorFeeBps: pool.data.creatorFeeBps,
              participants: null,
              feeLamports,
            };
            return row;
          }),
        );
        if (cancelled) return;
        baseRows.sort((a, b) => b.openTimeUnix - a.openTimeUnix);
        setPools(baseRows);

        // Second pass: per-pool participant counts. Done sequentially to
        // keep RPC pressure low; results trickle in via setState.
        const decoder = generated.getTicketBatchDecoder();
        for (const row of baseRows) {
          if (cancelled) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (await (rpc.getProgramAccounts as any)(
              PROGRAM_ID as Address,
              {
                commitment: "confirmed",
                encoding: "base64",
                filters: [
                  { dataSize: TICKET_BATCH_SIZE },
                  {
                    memcmp: {
                      offset: POOL_OFFSET,
                      bytes: row.poolAddress as Address,
                    },
                  },
                ],
              },
            ).send()) as ReadonlyArray<{
              pubkey: Address;
              account: { data: readonly [string, "base64"] };
            }>;
            const owners = new Set<string>();
            for (const acc of result) {
              const [b64] = acc.account.data;
              const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
              owners.add(String(decoder.decode(bytes).owner));
            }
            if (cancelled) return;
            setPools((prev) =>
              prev
                ? prev.map((p) =>
                    p.poolAddress === row.poolAddress
                      ? { ...p, participants: owners.size }
                      : p,
                  )
                : prev,
            );
          } catch (e) {
            console.warn(
              `participant count failed for ${row.poolAddress}:`,
              e,
            );
            if (cancelled) return;
            setPools((prev) =>
              prev
                ? prev.map((p) =>
                    p.poolAddress === row.poolAddress
                      ? { ...p, participants: 0 }
                      : p,
                  )
                : prev,
            );
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  // Aggregate stats. Only Resolved pools have actually-paid fees; Open and
  // AwaitingVrf pools have *pending* fees (the pot may still grow on Open).
  // We split the totals so the creator sees both numbers separately rather
  // than conflating them.
  const summary = useMemo(() => {
    if (!pools) return null;
    let earned = 0n;
    let pending = 0n;
    let totalTickets = 0n;
    let totalParticipants = 0;
    let resolved = 0;
    for (const p of pools) {
      totalTickets += p.totalTickets;
      if (p.participants !== null) totalParticipants += p.participants;
      if (p.state === 2) {
        earned += p.feeLamports;
        resolved += 1;
      } else {
        pending += p.feeLamports;
      }
    }
    return {
      poolsCount: pools.length,
      resolvedCount: resolved,
      earnedLamports: earned,
      pendingLamports: pending,
      totalTickets,
      totalParticipants,
    };
  }, [pools]);

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
    <div className="flex flex-col gap-8">
      {summary && <SummaryStats {...summary} />}
      <PoolHistoryTable pools={pools} />
    </div>
  );
}

function SummaryStats({
  poolsCount,
  resolvedCount,
  earnedLamports,
  pendingLamports,
  totalTickets,
  totalParticipants,
}: {
  poolsCount: number;
  resolvedCount: number;
  earnedLamports: bigint;
  pendingLamports: bigint;
  totalTickets: bigint;
  totalParticipants: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Earned"
        value={formatSol(earnedLamports)}
        sub={
          pendingLamports > 0n
            ? `+ ${formatSol(pendingLamports)} pending`
            : `${resolvedCount} resolved`
        }
        accent
      />
      <Stat
        label="Pools"
        value={poolsCount.toString()}
        sub={`${resolvedCount} resolved`}
      />
      <Stat
        label="Tickets sold"
        value={totalTickets.toLocaleString()}
        sub="across all pools"
      />
      <Stat
        label="Participants"
        value={totalParticipants.toLocaleString()}
        sub="distinct buyers"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-2xl uppercase tabular-nums ${
          accent ? "text-emerald-400" : "text-neutral-100"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </div>
      )}
    </div>
  );
}

function PoolHistoryTable({ pools }: { pools: PoolRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <th className="px-5 pt-4 pb-2 font-medium">Pool</th>
            <th className="pt-4 pb-2 font-medium">Status</th>
            <th className="pt-4 pb-2 font-medium">Duration</th>
            <th className="pt-4 pb-2 font-medium">Tickets</th>
            <th className="pt-4 pb-2 font-medium">Participants</th>
            <th className="pt-4 pb-2 font-medium">Pot</th>
            <th className="pt-4 pb-2 font-medium">Your fee</th>
            <th className="px-5 pt-4 pb-2 text-right font-medium">Open</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((p) => {
            const badge = statusLabel(p.state, p.closeTimeUnix);
            const earned = p.state === 2;
            return (
              <tr
                key={p.poolAddress}
                className="border-t border-neutral-800/50 transition-colors hover:bg-neutral-900/40"
              >
                <td className="px-5 py-3">
                  <div className="font-mono text-xs text-neutral-300">
                    {p.poolAddress.slice(0, 6)}…{p.poolAddress.slice(-4)}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    {p.accessMode === "Whitelist" ? "Whitelist" : "1 code/ticket"} ·{" "}
                    {(p.creatorFeeBps / 100).toFixed(1)}% fee
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="py-3 pr-4 font-mono text-xs tabular-nums text-neutral-400">
                  {durationLabel(p.openTimeUnix, p.closeTimeUnix)}
                </td>
                <td className="py-3 pr-4 tabular-nums text-neutral-200">
                  {p.totalTickets.toString()}
                </td>
                <td className="py-3 pr-4 tabular-nums text-neutral-200">
                  {p.participants === null ? "…" : p.participants.toString()}
                </td>
                <td className="py-3 pr-4 tabular-nums text-neutral-200">
                  {formatSol(p.totalPotLamports)}
                </td>
                <td
                  className={`py-3 pr-4 tabular-nums ${
                    earned ? "text-emerald-400" : "text-neutral-500"
                  }`}
                  title={earned ? "Paid at settle" : "Pending — pool not resolved"}
                >
                  {formatSol(p.feeLamports)}
                  {!earned && (
                    <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                      pending
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/create/my-pools/${p.poolAddress}`}
                    className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
                  >
                    Admin →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

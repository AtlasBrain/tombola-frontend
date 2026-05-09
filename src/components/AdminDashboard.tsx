"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { createSolanaRpc, type Address } from "@solana/kit";
import { PROGRAM_ID } from "@tombola/sdk";
import { LivePoolWatcher } from "./LivePoolWatcher";
import { AdminDashboardStats } from "./AdminDashboardStats";
import { AdminRedemptionStatus } from "./AdminRedemptionStatus";
import { AdminTopBuyersBar } from "./AdminTopBuyersBar";
import { AdminParticipantList } from "./AdminParticipantList";

interface Props {
  poolAddress: string;
}

interface ParticipantRow {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
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
  const [participants, setParticipants] = useState<ParticipantRow[] | null>(null);
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

  useEffect(() => {
    if (!pool) return;
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchAllMaybeTicketBatch } = await import(
          "@tombola/sdk/generated"
        );
        // getProgramAccounts with memcmp on TicketBatch.pool (offset 8 = first
        // field after 8-byte discriminator). dataSize = 89 = 8 disc + 32 pool +
        // 32 owner + 8 first + 8 last + 1 bump. Kit's RPC returns the bare
        // array (no { value } wrapper) when withContext isn't set; an earlier
        // version of this code wrongly destructured `.value` and silently
        // bottomed out to participants=[] in the catch.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const programAccounts = (await (rpc.getProgramAccounts as any)(
          PROGRAM_ID as Address,
          {
            commitment: "confirmed",
            encoding: "base64",
            filters: [
              { dataSize: BigInt(89) },
              { memcmp: { offset: 8n, bytes: poolAddress as Address } },
            ],
          },
        ).send()) as ReadonlyArray<{ pubkey: Address }>;
        const addresses = programAccounts.map((p) => p.pubkey);
        const accs = await fetchAllMaybeTicketBatch(rpc, addresses);
        const byOwner = new Map<string, { tickets: bigint; spent: bigint }>();
        for (const a of accs) {
          if (!a.exists) continue;
          const owner = String(a.data.owner);
          const ticketCount = a.data.lastTicketId - a.data.firstTicketId + 1n;
          const spent = ticketCount * pool.ticketPriceLamports;
          const cur = byOwner.get(owner) ?? { tickets: 0n, spent: 0n };
          byOwner.set(owner, {
            tickets: cur.tickets + ticketCount,
            spent: cur.spent + spent,
          });
        }
        if (cancelled) return;
        setParticipants(
          [...byOwner.entries()]
            .map(([owner, agg]) => ({
              owner,
              tickets: agg.tickets,
              spentLamports: agg.spent,
            }))
            .sort((a, b) => Number(b.tickets - a.tickets)),
        );
      } catch (e) {
        if (!cancelled) {
          console.warn("participant fetch failed:", e);
          setParticipants([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pool, connection, poolAddress]);

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
          style={{ ["--tear-bg" as never]: "#88cfc4" }}
          className="btn-fx fx-tear mt-6 inline-flex items-center gap-2 px-5 py-3 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
        >
          Connect wallet
          <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] text-[#88cfc4]">
            →
          </span>
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
            poolState={pool.state}
            closeTimeUnix={pool.closeTimeUnix}
          />
        </div>
        <div className="mt-8">
          <AdminTopBuyersBar participants={participants} />
        </div>
        <div className="mt-8">
          <AdminParticipantList
            participants={participants}
            rpcUrl={connection.rpcEndpoint}
          />
        </div>
      </main>
    </>
  );
}

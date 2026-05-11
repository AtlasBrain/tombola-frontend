"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PROGRAM_ID } from "@tombola/sdk";
import { Header } from "@/components/Header";
import { WalletLink } from "@/components/WalletLink";
import { formatSol } from "@/lib/format";
import { fetchLeaderboard, type Leaderboard } from "@/lib/leaderboard";

const LAVENDER = "#c9b5dc";
const MINT = "#88cfc4";

export const dynamic = "force-dynamic";

type Tab = "winners" | "buyers";

export default function LeaderboardPage() {
  const { connection } = useConnection();
  const [data, setData] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("winners");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchLeaderboard({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
        });
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <section className="pt-12 pb-8 sm:pt-16">
          <span className="inline-flex select-none items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
            <span
              className="pulse-soft h-1.5 w-1.5 rounded-full"
              style={{ background: MINT }}
              aria-hidden
            />
            Public pools
          </span>
          <h1 className="mt-3 font-display text-4xl uppercase leading-[0.95] sm:text-6xl">
            Leaderboard
          </h1>
          <p className="mt-4 max-w-md text-sm text-neutral-400 sm:text-base">
            Top winners and top buyers across the four public pools.
            On-chain data, ranked by who&apos;s actually showing up.
          </p>
        </section>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <TabButton active={tab === "winners"} onClick={() => setTab("winners")}>
            Top winners
          </TabButton>
          <TabButton active={tab === "buyers"} onClick={() => setTab("buyers")}>
            Top buyers
          </TabButton>
          {data && (
            <span className="ml-auto self-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {tab === "winners"
                ? `${data.resolvedRoundsCount} resolved round${data.resolvedRoundsCount === 1 ? "" : "s"}`
                : `${data.ticketBatchesCount} batches scanned`}
            </span>
          )}
        </div>

        {err && (
          <p className="text-sm text-rose-400" role="alert">
            Couldn&apos;t load leaderboard: {err}
          </p>
        )}

        {!err && data === null && (
          <p className="text-sm text-neutral-400">Loading…</p>
        )}

        {data && tab === "winners" && (
          <WinnerList data={data} rpcUrl={connection.rpcEndpoint} />
        )}
        {data && tab === "buyers" && (
          <BuyerList data={data} rpcUrl={connection.rpcEndpoint} />
        )}
      </main>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? {
              borderColor: LAVENDER,
              background: `${LAVENDER}26`,
              color: LAVENDER,
            }
          : undefined
      }
      className={`rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition ${
        active
          ? ""
          : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function WinnerList({ data, rpcUrl }: { data: Leaderboard; rpcUrl: string }) {
  if (data.topWinners.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center text-sm text-neutral-500">
        No public-pool rounds have resolved yet.
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {data.topWinners.map((w, i) => (
        <li
          key={w.address}
          className="rounded-2xl border border-neutral-900 bg-neutral-950/40 p-4 sm:p-5"
        >
          <div className="flex items-center gap-4">
            <RankBadge rank={i + 1} accent={MINT} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm text-neutral-200">
                <WalletLink
                  wallet={w.address}
                  rpcUrl={rpcUrl}
                  className="hover:text-white"
                />
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                {w.winsCount} win{w.winsCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-right">
              <div
                className="font-display text-xl uppercase tabular-nums sm:text-2xl"
                style={{ color: MINT }}
              >
                {formatSol(w.totalWonLamports)}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                won
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BuyerList({ data, rpcUrl }: { data: Leaderboard; rpcUrl: string }) {
  if (data.topBuyers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center text-sm text-neutral-500">
        No tickets bought in public pools yet.
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {data.topBuyers.map((b, i) => (
        <li
          key={b.address}
          className="rounded-2xl border border-neutral-900 bg-neutral-950/40 p-4 sm:p-5"
        >
          <div className="flex items-center gap-4">
            <RankBadge rank={i + 1} accent={LAVENDER} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm text-neutral-200">
                <WalletLink
                  wallet={b.address}
                  rpcUrl={rpcUrl}
                  className="hover:text-white"
                />
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                {b.poolsParticipatedIn} pool
                {b.poolsParticipatedIn === 1 ? "" : "s"} ·{" "}
                {formatSol(b.totalSpentLamports)} spent
              </div>
            </div>
            <div className="text-right">
              <div
                className="font-display text-xl uppercase tabular-nums sm:text-2xl"
                style={{ color: LAVENDER }}
              >
                {b.totalTickets.toLocaleString()}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                tickets
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function RankBadge({ rank, accent }: { rank: number; accent: string }) {
  // Top 3 get an accent fill; #4+ are neutral chips.
  const hot = rank <= 3;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-display text-base tabular-nums"
      style={
        hot
          ? {
              borderColor: `${accent}80`,
              background: `${accent}26`,
              color: accent,
            }
          : {
              borderColor: "rgb(38 38 38)",
              color: "#737373",
            }
      }
    >
      {rank}
    </span>
  );
}


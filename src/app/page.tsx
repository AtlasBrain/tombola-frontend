import Link from "next/link";
import { PROGRAM_ID } from "@tombola/sdk";
import { AllRoundsTable } from "@/components/AllRoundsTable";
import { BentoFooter } from "@/components/BentoFooter";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { PoolCard } from "@/components/PoolCard";
import { RecentWinners } from "@/components/RecentWinners";
import { Ticker } from "@/components/Ticker";
import { WhyItsFair } from "@/components/WhyItsFair";
import { MOCK_POOLS, type PoolView } from "@/lib/mock-pools";
import { getLivePools } from "@/lib/get-pools";
import { clusterLabelFor } from "@/lib/explorer-url";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = clusterLabelFor(RPC_URL);

export const dynamic = "force-dynamic";

type PoolSource = "live" | "mock";

async function loadPools(): Promise<{ pools: PoolView[]; source: PoolSource }> {
  try {
    const pools = await getLivePools();
    return { pools, source: "live" };
  } catch (err) {
    console.warn("getLivePools failed, falling back to mocks:", err);
    return { pools: MOCK_POOLS, source: "mock" };
  }
}

export default async function Home() {
  const { pools, source } = await loadPools();
  const watchedAddresses =
    source === "live"
      ? pools
          .map((p) => p.poolAddress)
          .filter((a): a is string => typeof a === "string")
      : [];

  return (
    <>
      <Ticker />
      <Header />
      <Hero />
      {watchedAddresses.length > 0 && (
        <LivePoolWatcher addresses={watchedAddresses} rpcUrl={RPC_URL} />
      )}

      <section id="pools" className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="font-display text-4xl uppercase sm:text-6xl">Public pools</h2>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              {pools.length} ROUNDS RUNNING IN PARALLEL · 0.01 SOL PER TICKET
            </p>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-neutral-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-300 sm:inline-flex">
            <span className="pulse-soft inline-block h-1.5 w-1.5 rounded-full bg-lime" />
            LIVE · {CLUSTER.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pools.map((pool) => (
            <PoolCard key={pool.poolType} pool={pool} rpcUrl={RPC_URL} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grad-private rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center">
          <h3 className="font-display text-3xl uppercase">Host your own raffle</h3>
          <p className="mt-2 text-sm text-neutral-400">
            Mint invite codes and run a private pool. You set the price,
            duration, and creator fee.
          </p>
          <Link
            href="/create"
            style={{ ["--tear-bg" as never]: "#88cfc4" }}
            className="btn-fx fx-tear mt-6 inline-flex items-center gap-2 px-5 py-3 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
          >
            Create a private pool
            <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] text-[#88cfc4]">
              →
            </span>
          </Link>
        </div>
      </section>

      <RecentWinners />
      <AllRoundsTable pools={pools} />
      <WhyItsFair />
      <HowItWorks />
      <BentoFooter pools={pools} programId={PROGRAM_ID.toString()} cluster={CLUSTER} />

      <footer className="border-t border-neutral-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 font-mono text-[10px] uppercase tracking-widest text-neutral-600 sm:flex-row">
          <span>© 2026 TOMBOLA · OPEN SOURCE</span>
          <div className="flex items-center gap-4">
            <a href="https://github.com/AtlasBrain/Project-Tombola" target="_blank" rel="noreferrer" className="transition-colors hover:text-lime">GITHUB</a>
          </div>
        </div>
      </footer>
    </>
  );
}

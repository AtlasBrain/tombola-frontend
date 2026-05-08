import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { PoolCard } from "@/components/PoolCard";
import { MOCK_POOLS, type PoolView } from "@/lib/mock-pools";
import { getLivePools } from "@/lib/get-pools";

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <header className="mb-12 sm:mb-20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Tombola</h1>
            <p className="mt-2 text-neutral-400 max-w-xl">
              Trustless on-chain raffles on Solana. Buy tickets in SOL, win the
              pot when your number comes up. Verifiable randomness via
              Switchboard On-Demand. 0.5% protocol fee, no hidden cuts.
            </p>
          </div>
          <div className="hidden sm:block">
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <main>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Public pools</h2>
          <span className="text-sm text-neutral-500">
            <span
              className={
                source === "live"
                  ? "inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20"
                  : "inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20"
              }
            >
              {source === "live" ? "live — localnet" : "mock data — validator offline"}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {pools.map((pool) => (
            <PoolCard key={pool.poolType} pool={pool} />
          ))}
        </div>
      </main>

      <footer className="mt-20 border-t border-neutral-900 pt-8 text-sm text-neutral-500">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <span className="font-mono">qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M</span>
            <span className="ml-2 text-neutral-600">— program ID (devnet)</span>
          </div>
          <a
            href="https://github.com/AtlasBrain/Project-Tombola"
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300"
          >
            github →
          </a>
        </div>
      </footer>
    </div>
  );
}

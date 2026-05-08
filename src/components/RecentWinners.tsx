import { formatSol } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { MOCK_WINNERS, type WinnerView } from "@/lib/mock-winners";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const TX_BASE = "https://explorer.solana.com/tx/";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function relativeTime(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function absoluteTime(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function clusterQuery(rpcUrl: string): string {
  // Reuse the same logic as explorerAddressUrl — peel off "/address/<addr>" → query.
  const probe = explorerAddressUrl("X", rpcUrl);
  const idx = probe.indexOf("?");
  return idx >= 0 ? probe.slice(idx) : "";
}

function txExplorerUrl(sig: string, rpcUrl: string): string {
  return `${TX_BASE}${sig}${clusterQuery(rpcUrl)}`;
}

function WinnerRow({ w }: { w: WinnerView }) {
  return (
    <tr className="border-t border-neutral-800/50 transition-colors hover:bg-neutral-900/40">
      <td className="px-6 py-3 text-neutral-200">{w.poolKind}</td>
      <td className="py-3 pr-4 tabular-nums text-neutral-500">
        #{w.round.toString()}
      </td>
      <td className="py-3 pr-4">
        <a
          href={explorerAddressUrl(w.winnerAddress, RPC_URL)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-neutral-300 transition-colors hover:text-neutral-100"
          title={w.winnerAddress}
        >
          {shortAddress(w.winnerAddress)}
        </a>
      </td>
      <td className="py-3 pr-4 font-medium tabular-nums text-emerald-400">
        {formatSol(w.payoutLamports)}
      </td>
      <td
        className="py-3 pr-4 tabular-nums text-neutral-500"
        title={absoluteTime(w.resolvedAtUnix)}
      >
        {relativeTime(w.resolvedAtUnix)}
      </td>
      <td className="px-6 py-3 text-right">
        {w.txSignature ? (
          <a
            href={txExplorerUrl(w.txSignature, RPC_URL)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
          >
            tx ↗
          </a>
        ) : (
          <span className="text-xs text-neutral-700">—</span>
        )}
      </td>
    </tr>
  );
}

function WinnerCard({ w }: { w: WinnerView }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-neutral-200">{w.poolKind}</div>
          <div className="text-xs text-neutral-500 tabular-nums">
            #{w.round.toString()} · {relativeTime(w.resolvedAtUnix)}
          </div>
        </div>
        <div className="text-base font-semibold text-emerald-400 tabular-nums">
          {formatSol(w.payoutLamports)}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <a
          href={explorerAddressUrl(w.winnerAddress, RPC_URL)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {shortAddress(w.winnerAddress)}
        </a>
        {w.txSignature && (
          <a
            href={txExplorerUrl(w.txSignature, RPC_URL)}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 transition-colors hover:text-neutral-300"
          >
            tx ↗
          </a>
        )}
      </div>
    </div>
  );
}

export function RecentWinners() {
  return (
    <section className="mt-12 sm:mt-20">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-xl font-semibold">Recent winners</h2>
        <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/20">
          mock — Phase 7
        </span>
      </div>

      {/* Mobile: stack as cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {MOCK_WINNERS.map((w) => (
          <WinnerCard key={`${w.poolKind}-${w.round}`} w={w} />
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="px-6 pt-4 pb-2 font-medium">Pool</th>
              <th className="pt-4 pb-2 font-medium">Round</th>
              <th className="pt-4 pb-2 font-medium">Winner</th>
              <th className="pt-4 pb-2 font-medium">Payout</th>
              <th className="pt-4 pb-2 font-medium">Resolved</th>
              <th className="px-6 pt-4 pb-2 text-right font-medium">Tx</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_WINNERS.map((w) => (
              <WinnerRow key={`${w.poolKind}-${w.round}`} w={w} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

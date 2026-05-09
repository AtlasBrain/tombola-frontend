import type { PoolView } from "@/lib/mock-pools";
import { BuyTicketButton } from "@/components/BuyTicketButton";
import { Countdown } from "@/components/Countdown";

const ACCENT_HEX: Record<PoolView["kind"], string> = {
  Weekly:    "#c9b5dc",
  Biweekly:  "#b8a5d4",
  Triweekly: "#88cfc4",
  Monthly:   "#e8d89e",
};

const GRAD_CLASS: Record<PoolView["kind"], string> = {
  Weekly:    "grad-weekly",
  Biweekly:  "grad-biweekly",
  Triweekly: "grad-triweekly",
  Monthly:   "grad-monthly",
};

function clusterFromRpc(rpcUrl: string): "devnet" | "mainnet" | "localnet" | "testnet" {
  if (rpcUrl.includes("devnet")) return "devnet";
  if (rpcUrl.includes("mainnet")) return "mainnet";
  if (rpcUrl.includes("testnet")) return "testnet";
  return "localnet";
}

export function PoolCard({ pool, rpcUrl }: { pool: PoolView; rpcUrl?: string }) {
  const accent = ACCENT_HEX[pool.kind];
  const gradCls = GRAD_CLASS[pool.kind];

  const potSol = Number(pool.totalPotLamports) / 1_000_000_000;
  const tickets = Number(pool.totalTickets);
  // BUYERS isn't on PoolView — derive a deterministic placeholder until backend exposes it
  const buyers = Math.max(1, Math.round(tickets / 3));
  const ticketPriceSol = Number(pool.ticketPriceLamports) / 1_000_000_000;

  // Your-odds: if you buy 1 ticket now, your chance to win = 1 / (totalTickets + 1).
  // Bar shrinks as tickets sell (your slice of the pie gets smaller).
  const oddsPct = 100 / (tickets + 1);
  const oddsBarPct = Math.min(100, oddsPct);
  const oddsLabel = `1 IN ${(tickets + 1).toLocaleString()}`;

  const isOpen = pool.state === "Open";
  const isDrawing = pool.state === "AwaitingVrf";

  const cluster = rpcUrl ? clusterFromRpc(rpcUrl) : "devnet";
  const explorerUrl = pool.poolAddress
    ? `https://solscan.io/account/${pool.poolAddress}?cluster=${cluster}`
    : "#";

  const stateLabel = isOpen ? "▲ OPEN" : isDrawing ? "◷ DRAWING" : "✓ RESOLVED";
  const stateClass = isOpen
    ? "border-lime/30 bg-lime/10 text-lime"
    : isDrawing
      ? "border-[#e8d89e]/30 bg-[#e8d89e]/10 text-[#e8d89e]"
      : "border-neutral-800 bg-neutral-900/50 text-neutral-400";

  const hoverBorderClass =
    pool.kind === "Weekly"    ? "hover:border-lime/40" :
    pool.kind === "Biweekly"  ? "hover:border-[#b8a5d4]/40" :
    pool.kind === "Triweekly" ? "hover:border-[#88cfc4]/40" :
                                "hover:border-[#e8d89e]/40";

  return (
    <article
      className={`${gradCls} group relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-7 transition-all hover:-translate-y-0.5 ${hoverBorderClass}`}
    >
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <div className="font-display text-3xl uppercase">{pool.kind}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            ROUND #{pool.round.toString()} ·{" "}
            <a href={explorerUrl} target="_blank" rel="noreferrer" className="hover:text-white">
              EXPLORER ↗
            </a>
          </div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${stateClass}`}
        >
          {stateLabel}
        </span>
      </header>

      {/* POT block */}
      <div
        className="mt-6 rounded-2xl border border-neutral-900 p-5"
        style={{
          background: `linear-gradient(135deg, ${accent}14, transparent 70%)`,
        }}
      >
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">POT</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
            {isDrawing ? "FINAL · AWAITING REVEAL" : ""}
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className="font-display text-6xl uppercase leading-none tabular-nums"
            style={{ color: accent }}
          >
            {potSol.toFixed(2)}
          </span>
          <span className="font-display text-2xl uppercase text-neutral-500">SOL</span>
        </div>
      </div>

      {/* Mini stats — TICKETS / BUYERS / CLOSES IN */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-neutral-900 bg-neutral-950/80 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">TICKETS</div>
          <div className="mt-1 font-display text-xl uppercase tabular-nums">{tickets.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-950/80 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">BUYERS</div>
          <div className="mt-1 font-display text-xl uppercase tabular-nums">{buyers}</div>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-950/80 p-3">
          <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">CLOSES IN</div>
          <div className="mt-1 font-display text-xl uppercase tabular-nums">
            <Countdown targetUnix={pool.closeTimeUnix} />
          </div>
        </div>
      </div>

      {/* Your odds — chance to win if you buy 1 ticket right now */}
      <div className="mt-5">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
          <span className="text-neutral-500">YOUR ODDS</span>
          <span className="text-neutral-300">{oddsLabel} ({oddsPct.toFixed(oddsPct < 10 ? 2 : 1)}%)</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-900">
          <div className="h-full rounded-full" style={{ width: `${oddsBarPct}%`, background: accent }} />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-6">
        {isOpen ? (
          <BuyTicketButton
            poolType={pool.poolType}
            round={pool.round}
            ticketPriceLamports={pool.ticketPriceLamports}
            closed={false}
            accentColor={accent}
            ticketPriceSol={ticketPriceSol}
          />
        ) : (
          <button disabled className="mt-0 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-3 font-display text-sm uppercase text-neutral-500">
            ROUND CLOSED <span className="font-mono opacity-70">· {isDrawing ? "DRAWING" : "RESOLVED"}</span>
          </button>
        )}
      </div>
    </article>
  );
}

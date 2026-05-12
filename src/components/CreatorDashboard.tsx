"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { type RedemptionMetric } from "@/lib/creator-pools";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { WalletLink } from "@/components/WalletLink";
import { formatSol, shortAddress} from "@/lib/format";
import { Metric, Stat } from "@/components/ui/Stat";
import { UserName } from "@/components/UserName";
import { Countdown } from "@/components/Countdown";

// Heavy form modal — 178 LOC + transitively pulls CreatePoolForm + the
// merkle-tree helpers. Only loaded when the creator clicks "+ Create new
// pool", which keeps the initial /create payload smaller for the common
// "just browse my pools" view.
const CreatePoolModal = dynamic(
  () =>
    import("@/components/CreatePoolModal").then((m) => ({
      default: m.CreatePoolModal,
    })),
  { ssr: false },
);
import {
  useCreatorPools,
  type CreatorPoolRow as PoolRow,
} from "@/hooks/useCreatorPools";

const MINT = "#88cfc4";

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
): { label: string; cls: string; style?: React.CSSProperties } {
  if (state === 2)
    return {
      label: "✓ RESOLVED",
      cls: "border border-neutral-800 bg-neutral-900/50 text-neutral-400",
    };
  if (state === 1)
    return {
      label: "◷ DRAWING",
      cls: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
    };
  if (closeTimeUnix * 1000 <= Date.now())
    return {
      label: "CLOSED",
      cls: "border border-amber-500/30 bg-amber-500/10 text-amber-400",
    };
  return {
    label: "▲ OPEN",
    cls: "border",
    style: {
      borderColor: `${MINT}4d`,
      background: `${MINT}1a`,
      color: MINT,
    },
  };
}

export function CreatorDashboard() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  const wallet = publicKey?.toBase58() ?? null;
  const { pools, error: err, reload } = useCreatorPools(wallet, connection);

  // Aggregate stats — same approach as the buyer dashboard's lifetime tile row.
  const summary = useMemo(() => {
    if (!pools)
      return {
        poolsCount: 0,
        liveCount: 0,
        resolvedCount: 0,
        earnedLamports: 0n,
        pendingLamports: 0n,
        totalTickets: 0n,
        totalParticipants: 0,
      };
    let earned = 0n;
    let pending = 0n;
    let totalTickets = 0n;
    let totalParticipants = 0;
    let resolved = 0;
    let live = 0;
    for (const p of pools) {
      totalTickets += p.totalTickets;
      if (p.participants !== null) totalParticipants += p.participants;
      if (p.state === 2) {
        earned += p.feeLamports;
        resolved += 1;
      } else {
        pending += p.feeLamports;
        live += 1;
      }
    }
    return {
      poolsCount: pools.length,
      liveCount: live,
      resolvedCount: resolved,
      earnedLamports: earned,
      pendingLamports: pending,
      totalTickets,
      totalParticipants,
    };
  }, [pools]);

  // Live = currently accepting tickets. State 0 (Open) + close_time in the
  // future. Open+past-close, AwaitingVrf, and Resolved all fall into history
  // — nobody can buy into them anymore.
  const isLive = (p: PoolRow) =>
    p.state === 0 && p.closeTimeUnix * 1000 > Date.now();
  const live = pools?.filter(isLive) ?? [];
  const history = pools?.filter((p) => !isLive(p)) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <CreateButton onClick={() => setModalOpen(true)} />

      {!wallet ? (
        <p className="text-sm text-neutral-400">
          Connect your wallet to see pools you&apos;ve created.
        </p>
      ) : err ? (
        <p className="text-sm text-rose-400" role="alert">
          Couldn&apos;t load your pools: {err}
        </p>
      ) : pools === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : pools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-10 text-center">
          <p className="font-display text-2xl uppercase">No pools yet</p>
          <p className="mt-2 text-sm text-neutral-500">
            Click <span className="font-mono uppercase">+ Create new pool</span>{" "}
            above to mint your first batch of invite codes.
          </p>
        </div>
      ) : (
        <>
          <SummaryStats {...summary} />
          {live.length > 0 && (
            <PoolsSection title="Live" pools={live} rpcUrl={connection.rpcEndpoint} />
          )}
          {history.length > 0 && (
            <PoolsSection
              title="History"
              pools={history}
              rpcUrl={connection.rpcEndpoint}
            />
          )}
        </>
      )}

      <CreatePoolModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPoolCreated={reload}
      />
    </div>
  );
}

function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Mint a batch of invite codes for a private raffle
      </p>
      <button
        type="button"
        onClick={onClick}
        style={{ ["--tear-bg" as never]: MINT }}
        className="btn-fx fx-tear flex items-center gap-2 px-5 py-3 font-display text-xs uppercase tracking-widest text-black transition hover:brightness-110"
      >
        + Create new pool
        <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] text-[#88cfc4]">
          →
        </span>
      </button>
    </div>
  );
}

function SummaryStats(props: {
  poolsCount: number;
  liveCount: number;
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
        value={formatSol(props.earnedLamports)}
        sub={
          props.pendingLamports > 0n
            ? `+ ${formatSol(props.pendingLamports)} pending`
            : `${props.resolvedCount} resolved`
        }
        valueColor={MINT}
      />
      <Stat
        label="Pools"
        value={props.poolsCount.toString()}
        sub={`${props.liveCount} live · ${props.resolvedCount} resolved`}
      />
      <Stat
        label="Tickets sold"
        value={props.totalTickets.toLocaleString()}
        sub="across all pools"
      />
      <Stat
        label="Participants"
        value={props.totalParticipants.toLocaleString()}
        sub="distinct buyers"
      />
    </div>
  );
}

function PoolsSection({
  title,
  pools,
  rpcUrl,
}: {
  title: string;
  pools: PoolRow[];
  rpcUrl: string;
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-display text-2xl uppercase">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 tabular-nums">
          {pools.length} pool{pools.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {pools.map((p) => (
          <PoolRow key={p.poolAddress} pool={p} rpcUrl={rpcUrl} />
        ))}
      </div>
    </section>
  );
}

function PoolRow({ pool, rpcUrl }: { pool: PoolRow; rpcUrl: string }) {
  const status = statusLabel(pool.state, pool.closeTimeUnix);
  // Truly live = still accepting tickets (Open AND not past close). Closed-
  // but-not-resolved pools don't show a redemption-ratio cell because no new
  // redemptions can land — they're waiting for the keeper to commit.
  const trulyLive =
    pool.state === 0 && pool.closeTimeUnix * 1000 > Date.now();
  const earned = pool.state === 2;

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition hover:-translate-y-px"
      style={{
        backgroundImage: `linear-gradient(90deg, ${MINT}10 0%, transparent 30%)`,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
        style={{ background: MINT }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/create/my-pools/${pool.poolAddress}`}
              className="font-display text-xl uppercase transition hover:brightness-125"
            >
              Private · {shortAddress(pool.poolAddress)}
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${status.cls}`}
              style={status.style}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            <a
              href={explorerAddressUrl(pool.poolAddress, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-300"
            >
              {shortAddress(pool.poolAddress)} ↗
            </a>
            {pool.state === 2 && pool.winner && (
              <>
                {" · winner "}
                <WalletLink
                  wallet={pool.winner}
                  rpcUrl={rpcUrl}
                  className="hover:text-neutral-300"
                  style={{ color: MINT }}
                />
              </>
            )}
            {" · "}
            {pool.accessMode === "Whitelist" ? "Whitelist" : "1 code / ticket"}
            {" · "}
            {(pool.creatorFeeBps / 100).toFixed(1)}% fee
            {" · "}
            {durationLabel(pool.openTimeUnix, pool.closeTimeUnix)} duration
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Pot
          </div>
          <div
            className="font-display text-3xl uppercase leading-none tabular-nums"
            style={{ color: MINT }}
          >
            {formatSol(pool.totalPotLamports)}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 pl-2 text-sm sm:grid-cols-4">
        {/* For live pools, the first slot is a live countdown so creators
            can see at a glance how much time is left before the keeper
            draws. Non-live pools (resolved / drawing / closed) keep the
            static ticket count there — countdown would always read "—". */}
        {trulyLive ? (
          <Metric
            label="Closes in"
            value={
              <Countdown targetUnix={pool.closeTimeUnix} />
            }
            sub={`${pool.totalTickets.toString()} tickets sold`}
            valueColor={MINT}
          />
        ) : (
          <Metric label="Tickets" value={pool.totalTickets.toString()} />
        )}
        <Metric
          label="Participants"
          value={
            pool.participants === null ? "…" : pool.participants.toString()
          }
        />
        <Metric
          label="Your fee"
          value={formatSol(pool.feeLamports)}
          sub={earned ? "paid at settle" : "pending"}
          valueColor={earned ? MINT : undefined}
        />
        {trulyLive ? (
          <RedemptionMetricCell
            metric={pool.redemption}
            poolAddress={pool.poolAddress}
          />
        ) : pool.state === 2 ? (
          <Metric
            label="Resolved"
            value={pool.winner ? "🏆" : "✓"}
            sub={
              pool.winner ? (
                <>
                  winner <UserName wallet={pool.winner} />
                </>
              ) : (
                `${pool.totalTickets.toString()} tickets sold (voided)`
              )
            }
          />
        ) : pool.state === 1 ? (
          <Metric label="Drawing" value="◷" sub="winner being picked" />
        ) : (
          <Metric label="Closed" value="—" sub="awaiting keeper draw" />
        )}
      </dl>
    </article>
  );
}

function RedemptionMetricCell({
  metric,
  poolAddress,
}: {
  metric: RedemptionMetric | null;
  poolAddress: string;
}) {
  if (metric === null) {
    return <Metric label="Invite codes" value="…" />;
  }
  if (metric.totalCodes === null) {
    return (
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Invite codes
        </div>
        <div className="mt-0.5 font-display text-lg uppercase tabular-nums text-neutral-300">
          {metric.redeemedCount.toString()}
        </div>
        <Link
          href={`/create/my-pools/${poolAddress}`}
          className="font-mono text-[10px] tabular-nums text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
        >
          codes not in browser ↗
        </Link>
      </div>
    );
  }
  const pct =
    metric.totalCodes > 0
      ? Math.min(100, Math.round((metric.redeemedCount / metric.totalCodes) * 100))
      : 0;
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Invite codes
      </div>
      <div className="mt-0.5 font-display text-lg uppercase tabular-nums text-neutral-100">
        {metric.redeemedCount} / {metric.totalCodes}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: MINT }}
        />
      </div>
      <div className="font-mono text-[10px] tabular-nums text-neutral-500">
        {pct}% redeemed
      </div>
    </div>
  );
}


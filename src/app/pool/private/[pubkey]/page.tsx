"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  createSolanaRpc,
  type Address,
} from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";
import { Header } from "@/components/Header";
import { Countdown } from "@/components/Countdown";
import { LivePoolWatcher } from "@/components/LivePoolWatcher";
import { BuyTicketPrivateButton } from "@/components/BuyTicketPrivateButton";
import { DrawWinnerButton } from "@/components/DrawWinnerButton";
import { RecentBuysTable, type BatchRow } from "@/components/RecentBuysTable";
import { WinnerBanner } from "@/components/WinnerBanner";
import { WinOdds } from "@/components/WinOdds";
import { PoolInviteBanner } from "@/components/PoolInviteBanner";
import { UserName } from "@/components/UserName";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, shortAddress} from "@/lib/format";
import {
  decodeAccountBytes,
  fetchTicketBatches,
} from "@/lib/solana/program-queries";

const PRIVATE_ACCENT = "#88cfc4"; // mint — see globals.css .grad-private + spec proposal 03

interface PoolData {
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creator: string;
  creatorFeeBps: number;
  winner: string | null;
  winningTicketId: bigint | null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapWinner(w: any): string | null {
  if (!w) return null;
  if (typeof w === "object" && "__option" in w) {
    return w.__option === "Some" ? String(w.value) : null;
  }
  return String(w);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapTicketId(v: any): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "__option" in v) {
    return v.__option === "Some" && v.value !== undefined
      ? BigInt(v.value as bigint | number | string)
      : null;
  }
  return BigInt(v as bigint | number | string);
}

const STATE_PILL: Record<
  0 | 1 | 2,
  { label: string; usesAccent: boolean }
> = {
  0: { label: "▲ OPEN", usesAccent: true },
  1: { label: "◷ DRAWING", usesAccent: false },
  2: { label: "✓ RESOLVED", usesAccent: false },
};

export default function PrivatePoolPage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = use(params);
  const { connection } = useConnection();
  const [pool, setPool] = useState<PoolData | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Bumped by LivePoolWatcher.onChange and by BuyTicketPrivateButton.onPurchased
  // to retrigger the data-fetch effect. router.refresh is a no-op on this
  // client-only page, so we need a local signal.
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = () => setReloadKey((k) => k + 1);
  // Live mirror of BuyTicketPrivateButton's qty input. Drives the
  // "After buying" overlay on the WinOdds gauge. 0 = no preview.
  const [previewQty, setPreviewQty] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        const acc = await fetchPrivatePool(rpc, pubkey as Address);
        if (cancelled) return;
        const ticketPrice = acc.data.ticketPrice;
        setPool({
          ticketPriceLamports: ticketPrice,
          totalTickets: acc.data.totalTickets,
          totalPotLamports: acc.data.totalPot,
          closeTimeUnix: Number(acc.data.closeTime),
          state: acc.data.state as 0 | 1 | 2,
          accessMode: accessModeLabel(acc.data.accessMode),
          creator: String(acc.data.creator),
          creatorFeeBps: acc.data.creatorFeeBps,
          winner: unwrapWinner(acc.data.winner),
          winningTicketId: unwrapTicketId(acc.data.winningTicket),
        });

        // Fetch all TicketBatch accounts whose `pool` field == this pool PDA.
        // Same memcmp filter as the public-pool detail server fetch.
        const result = await fetchTicketBatches({
          rpc,
          programId: PROGRAM_ID,
          pool: pubkey,
        });

        const decoder = generated.getTicketBatchDecoder();
        const rows: BatchRow[] = result.map((accInfo) => {
          const bytes = decodeAccountBytes(accInfo);
          const b = decoder.decode(bytes);
          const quantity = b.lastTicketId - b.firstTicketId + 1n;
          return {
            batchAddress: String(accInfo.pubkey),
            owner: String(b.owner),
            firstTicketId: b.firstTicketId,
            lastTicketId: b.lastTicketId,
            quantity,
            spentLamports: quantity * ticketPrice,
          };
        });
        if (!cancelled) setBatches(rows);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load pool");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, pubkey, reloadKey]);

  // Buyers = unique TicketBatch.owner count. Recompute when the batch list
  // mutates (e.g. someone buys mid-page).
  const buyers = useMemo(() => {
    const set = new Set<string>();
    for (const b of batches) set.add(b.owner);
    return set.size;
  }, [batches]);

  if (err) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="font-display text-3xl uppercase">Pool not found</h1>
          <p className="mt-4 text-sm text-neutral-400">{err}</p>
        </main>
      </>
    );
  }
  if (!pool) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-neutral-400">Loading…</p>
        </main>
      </>
    );
  }

  const closed = pool.state !== 0 || pool.closeTimeUnix * 1000 <= Date.now();
  const ticketPriceSol = Number(pool.ticketPriceLamports) / 1_000_000_000;
  const potSol = Number(pool.totalPotLamports) / 1_000_000_000;
  const pill = STATE_PILL[pool.state];
  const pillStyle = pill.usesAccent
    ? {
        borderColor: `${PRIVATE_ACCENT}4d`,
        background: `${PRIVATE_ACCENT}1a`,
        color: PRIVATE_ACCENT,
      }
    : undefined;
  const pillClass = pill.usesAccent
    ? "border"
    : pool.state === 1
      ? "border border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border border-neutral-800 bg-neutral-900/50 text-neutral-400";

  return (
    <>
      <Header />
      <LivePoolWatcher
        addresses={[pubkey]}
        rpcUrl={connection.rpcEndpoint}
        onChange={bumpReload}
      />
      <main className="mx-auto max-w-3xl px-6 py-12">
        {/* Friend invite banner — only renders for wallets with a
            server-stored invite for this pool. One-click claim builds
            the existing redeemInviteCodeWhitelist instruction. */}
        <PoolInviteBanner poolAddress={pubkey} onClaimed={bumpReload} />

        {/* === HEADER CARD =========================================== */}
        <article className="grad-private rounded-3xl border border-neutral-800 bg-neutral-950 p-7">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Private pool · {pool.accessMode === "Whitelist" ? "WHITELIST" : "ONE CODE PER TICKET"}
              </p>
              <h1 className="mt-1 font-display text-3xl uppercase">
                {shortAddress(pubkey)}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                CREATOR{" "}
                <a
                  href={`/u/${pool.creator}?tab=creator`}
                  className="hover:text-white"
                >
                  <UserName wallet={pool.creator} /> →
                </a>{" "}
                · FEE {(pool.creatorFeeBps / 100).toFixed(1)}% ·{" "}
                <a
                  href={explorerAddressUrl(pubkey, connection.rpcEndpoint)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  EXPLORER ↗
                </a>
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${pillClass}`}
              style={pillStyle}
            >
              {pill.label}
            </span>
          </header>

          {/* === POT BLOCK ============================================== */}
          <div
            className="mt-6 rounded-2xl border border-neutral-900 p-5"
            style={{
              backgroundImage: `linear-gradient(135deg, ${PRIVATE_ACCENT}14, transparent 70%)`,
            }}
          >
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Pot
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                {pool.state === 1 ? "FINAL · AWAITING REVEAL" : ""}
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="font-display text-6xl uppercase leading-none tabular-nums"
                style={{ color: PRIVATE_ACCENT }}
              >
                {potSol.toFixed(2)}
              </span>
              <span className="font-display text-2xl uppercase text-neutral-500">
                SOL
              </span>
            </div>
          </div>

          {/* === MINI STATS ============================================= */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Tickets" value={pool.totalTickets.toLocaleString()} />
            <MiniStat label="Buyers" value={buyers.toLocaleString()} />
            <MiniStat
              label={pool.state === 0 ? "Closes in" : "Closed"}
              value={<Countdown targetUnix={pool.closeTimeUnix} />}
            />
          </div>

          {/* === BUY ==================================================== */}
          {pool.accessMode === "Whitelist" && (
            <BuyTicketPrivateButton
              poolAddress={pubkey}
              ticketPriceLamports={pool.ticketPriceLamports}
              closed={closed}
              accent={PRIVATE_ACCENT}
              ticketPriceSol={ticketPriceSol}
              onPurchased={bumpReload}
              onQtyChange={setPreviewQty}
              creator={pool.creator}
            />
          )}

          {/* === YOUR ODDS ============================================== */}
          <div className="mt-5">
            <WinOdds
              poolAddress={pubkey}
              totalTickets={pool.totalTickets}
              accent={PRIVATE_ACCENT}
              previewQty={previewQty}
            />
          </div>
        </article>

        {/* === WINNER BANNER (only on resolved pools) =================== */}
        <WinnerBanner
          poolAddress={pubkey}
          winner={pool.winner}
          winningTicketId={pool.winningTicketId}
          totalPotLamports={pool.totalPotLamports}
          batches={batches}
          state={pool.state}
          accent={PRIVATE_ACCENT}
        />

        {/* === DRAW (creator-only / public action) ===================== */}
        <DrawWinnerButton
          poolAddress={pubkey}
          state={pool.state}
          closeTimeUnix={pool.closeTimeUnix}
          totalTickets={pool.totalTickets}
          creator={pool.creator}
        />

        {/* === RECENT BUYS ============================================ */}
        <div className="mt-10">
          <RecentBuysTable
            batches={batches}
            totalTickets={pool.totalTickets}
            accent={PRIVATE_ACCENT}
            displayHeading
          />
        </div>

        {/* === ticket-price hint (subtle) ============================== */}
        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          {formatSol(pool.ticketPriceLamports)} per ticket
        </p>
      </main>
    </>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-950/80 p-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-1 font-display text-xl uppercase tabular-nums">
        {value}
      </div>
    </div>
  );
}

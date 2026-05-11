"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer-url";
import { formatSol, formatTickets } from "@/lib/format";
import {
  fetchBuySignatures,
  relativeTime,
  type BuySig,
} from "@/lib/fetch-buy-signatures";

export interface BatchRow {
  batchAddress: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
  quantity: bigint;
  spentLamports: bigint;
}

interface Props {
  batches: BatchRow[];
  totalTickets: bigint;
  /** When set, "you"-row highlight + section heading use this hex/CSS color
   *  instead of emerald. Spent-amount cells stay accent-colored too. */
  accentColor?: string;
  /** When true, section heading is rendered as font-display uppercase to
   *  match the landing-page typography. Default false (legacy public page). */
  displayHeading?: boolean;
}

const DEFAULT_LIMIT = 10;

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/**
 * Sort by firstTicketId DESC = most-recent-first (ticket IDs are monotonic
 * within a pool — every successful buy increments the pool's total_tickets
 * counter, so a higher firstTicketId can only have come from a later buy).
 */
function sortByRecency(batches: BatchRow[]): BatchRow[] {
  return [...batches].sort((a, b) =>
    a.firstTicketId > b.firstTicketId
      ? -1
      : a.firstTicketId < b.firstTicketId
        ? 1
        : 0,
  );
}

export function RecentBuysTable({
  batches,
  totalTickets,
  // Default mint — every page that calls this without an explicit accent
  // (e.g. caller falls back) used to render emerald, which is not in the
  // brand palette. Mint is the safe brand fallback.
  accentColor = "#88cfc4",
  displayHeading = false,
}: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [showAll, setShowAll] = useState(false);
  const [sigs, setSigs] = useState<Map<string, BuySig>>(new Map());

  const sorted = useMemo(() => sortByRecency(batches), [batches]);
  const visible = showAll ? sorted : sorted.slice(0, DEFAULT_LIMIT);
  const hiddenCount = Math.max(0, sorted.length - DEFAULT_LIMIT);
  const myAddr = publicKey?.toBase58() ?? null;

  // Per-owner aggregate ticket count. The Odds column shows the OWNER's
  // total chance to win (their cumulative tickets / pool total), repeated
  // on each of their rows — a quick read of who has the biggest stake.
  const ticketsByOwner = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const b of batches) m.set(b.owner, (m.get(b.owner) ?? 0n) + b.quantity);
    return m;
  }, [batches]);
  function oddsPctFor(owner: string): number | null {
    if (totalTickets <= 0n) return null;
    const owned = ticketsByOwner.get(owner) ?? 0n;
    if (owned <= 0n) return null;
    return Number(owned * 10_000n) / Number(totalTickets) / 100;
  }

  // Fetch sigs for whatever's currently visible. When the user expands to
  // "Show all" we top-up sigs for the additional batches in a second call.
  useEffect(() => {
    if (visible.length === 0) {
      setSigs(new Map());
      return;
    }
    let cancelled = false;
    const missing = visible
      .map((b) => b.batchAddress)
      .filter((a) => !sigs.has(a));
    if (missing.length === 0) return;
    (async () => {
      const map = await fetchBuySignatures(connection, missing);
      if (cancelled) return;
      setSigs((prev) => {
        const merged = new Map(prev);
        for (const [k, v] of map) merged.set(k, v);
        return merged;
      });
    })();
    return () => {
      cancelled = true;
    };
    // sigs intentionally excluded — would re-trigger on every set merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, visible]);

  const rpcUrl = connection.rpcEndpoint;
  const nowSec = Math.floor(Date.now() / 1000);
  const hasMine = myAddr ? sorted.some((b) => b.owner === myAddr) : false;

  // Pre-compute colored styles once so JSX stays readable.
  const youRowStyle = accentColor
    ? { background: `${accentColor}0d` }
    : undefined;
  const youBadgeStyle = accentColor
    ? { background: `${accentColor}33`, color: accentColor }
    : undefined;
  const youOwnerStyle = accentColor ? { color: accentColor } : undefined;
  const spentAccent = accentColor ?? undefined;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-end justify-between">
        {displayHeading ? (
          <h2 className="font-display text-3xl uppercase">Recent buys</h2>
        ) : (
          <h2 className="text-xl font-semibold">Recent buys</h2>
        )}
        <span
          className={
            displayHeading
              ? "font-mono text-[10px] uppercase tracking-widest text-neutral-500 tabular-nums"
              : "text-sm text-neutral-500 tabular-nums"
          }
        >
          {sorted.length} buy{sorted.length === 1 ? "" : "s"} ·{" "}
          {formatTickets(totalTickets)} ticket
          {totalTickets === 1n ? "" : "s"} sold
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center text-sm text-neutral-500">
          No tickets bought in this round yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="px-6 pt-4 pb-2 font-medium">Buyer</th>
                  <th className="pt-4 pb-2 font-medium">Tickets</th>
                  <th className="pt-4 pb-2 font-medium">Odds</th>
                  <th className="pt-4 pb-2 font-medium">Range</th>
                  <th className="pt-4 pb-2 font-medium">When</th>
                  <th className="pt-4 pb-2 font-medium">Spent</th>
                  <th className="px-6 pt-4 pb-2 text-right font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const sig = sigs.get(b.batchAddress);
                  const mine = myAddr !== null && b.owner === myAddr;
                  return (
                    <tr
                      key={b.batchAddress}
                      className="border-t border-neutral-800/50 transition-colors hover:brightness-110"
                      style={
                        mine ? youRowStyle : { background: "transparent" }
                      }
                    >
                      <td className="px-6 py-3">
                        <a
                          href={explorerAddressUrl(b.owner, rpcUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className={`font-mono transition-colors ${
                            mine
                              ? "hover:brightness-125"
                              : "text-neutral-300 hover:text-neutral-100"
                          }`}
                          style={mine ? youOwnerStyle : undefined}
                          title={b.owner}
                        >
                          {shortAddress(b.owner)}
                          {mine && (
                            <span
                              className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                              style={youBadgeStyle}
                            >
                              you
                            </span>
                          )}
                        </a>
                      </td>
                      <td className="py-3 pr-4 font-medium tabular-nums text-neutral-200">
                        {b.quantity.toString()}
                      </td>
                      <td
                        className="py-3 pr-4 tabular-nums"
                        style={mine ? youOwnerStyle : { color: "#9ca3af" }}
                        title={`${ticketsByOwner.get(b.owner)?.toString() ?? "0"} of ${totalTickets.toString()} total tickets`}
                      >
                        {(() => {
                          const pct = oddsPctFor(b.owner);
                          return pct === null
                            ? "—"
                            : `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
                        })()}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-neutral-500">
                        #{b.firstTicketId.toString()}–#{b.lastTicketId.toString()}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-neutral-500">
                        {sig ? relativeTime(sig.blockTime, nowSec) : "…"}
                      </td>
                      <td
                        className="py-3 pr-4 tabular-nums"
                        style={{ color: spentAccent }}
                      >
                        {formatSol(b.spentLamports)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {sig ? (
                          <a
                            href={explorerTxUrl(sig.signature, rpcUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-neutral-400 transition-colors hover:text-neutral-200"
                            title={sig.signature}
                          >
                            {sig.signature.slice(0, 4)}…↗
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-neutral-600">…</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!showAll && hiddenCount > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-neutral-500">
                Showing {DEFAULT_LIMIT} most recent ·{" "}
                <span className="text-neutral-400">{hiddenCount} more</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                Show all {sorted.length}
              </button>
            </div>
          )}
          {showAll && hiddenCount > 0 && (
            <div className="mt-3 flex justify-end text-sm">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
              >
                Collapse to {DEFAULT_LIMIT}
              </button>
            </div>
          )}
          {!hasMine && myAddr && (
            <p className="mt-3 text-xs text-neutral-500">
              You haven&apos;t bought tickets in this round yet.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export const __test = { sortByRecency };

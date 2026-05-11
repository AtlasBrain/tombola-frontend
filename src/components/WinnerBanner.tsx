"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { explorerTxUrl } from "@/lib/explorer-url";
import { WalletLink } from "@/components/WalletLink";
import { formatSol } from "@/lib/format";
import {
  fetchBuySignatures,
  type BuySig,
} from "@/lib/fetch-buy-signatures";
import { useToast } from "@/components/Toast";
import {
  findWinningBatch,
  type BatchRange,
} from "@/lib/winning-batch";
import { pushNotification } from "@/lib/notifications";

interface Props {
  /** Pool PDA. Used to look up the settle tx signature. */
  poolAddress: string;
  /** Winner's wallet address (base58). null when pool isn't resolved yet. */
  winner: string | null;
  /** winning_ticket_id from the pool account. null when pre-settle. */
  winningTicketId: bigint | null;
  /** Total pot in lamports. Frozen at settle time on-chain — what they won. */
  totalPotLamports: bigint;
  /** All TicketBatches for this pool (used to find which batch is the winner). */
  batches: BatchRange[];
  /** Pool state — used to detect AwaitingVrf -> Resolved transitions for the toast. */
  state: "Open" | "AwaitingVrf" | "Resolved" | 0 | 1 | 2;
  /** Hex/CSS accent color. When omitted, uses mint as the safe brand
   *  default — emerald is no longer in the palette. */
  accent?: string;
}

function isResolved(s: Props["state"]): boolean {
  return s === "Resolved" || s === 2;
}

/**
 * Renders nothing pre-settle. After settle:
 *   - Standard banner with winner pubkey + settle tx ↗ + winning batch tx ↗
 *   - "🎉 YOU WON" celebratory variant when connected wallet matches winner
 *   - Fires a toast + browser Notification when state transitions to Resolved
 *     (only once per page load, only when the connected wallet is the winner).
 */
export function WinnerBanner({
  poolAddress,
  winner,
  winningTicketId,
  totalPotLamports,
  batches,
  state,
  accent = "#88cfc4", // mint default — emerald is not in the palette
}: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { push: pushToast } = useToast();
  const [settleSig, setSettleSig] = useState<string | null>(null);
  const [batchSig, setBatchSig] = useState<BuySig | null>(null);
  const notifiedRef = useRef(false);

  const resolved = isResolved(state);
  const myAddr = publicKey?.toBase58() ?? null;
  const isWinner = !!(winner && myAddr && winner === myAddr);

  const winningBatch = useMemo(() => {
    if (winningTicketId === null) return null;
    return findWinningBatch(batches, winningTicketId);
  }, [batches, winningTicketId]);

  // Fetch settle-tx signature on the pool PDA. After settle the pool's most-
  // recent signature is the settle tx. We only fetch once (poolAddress only
  // changes on navigation).
  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    (async () => {
      try {
        const sigs = await connection.getSignaturesForAddress(
          new PublicKey(poolAddress),
          { limit: 1 },
        );
        if (cancelled) return;
        if (sigs.length > 0) setSettleSig(sigs[0].signature);
      } catch {
        // network blip — leave null; the rest of the banner still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, poolAddress, resolved]);

  // Fetch winning-batch buy-tx signature.
  useEffect(() => {
    if (!winningBatch) return;
    let cancelled = false;
    (async () => {
      const map = await fetchBuySignatures(connection, [
        winningBatch.batchAddress,
      ]);
      if (cancelled) return;
      const sig = map.get(winningBatch.batchAddress);
      if (sig) setBatchSig(sig);
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, winningBatch]);

  // One-shot toast + Notification + persistent inbox entry when YOU are the
  // winner. Guarded by notifiedRef so it doesn't refire on hot-reload /
  // state churn.
  useEffect(() => {
    if (!resolved || !isWinner || notifiedRef.current) return;
    if (!myAddr) return;
    notifiedRef.current = true;
    const message = `You won ${formatSol(totalPotLamports)}!`;
    pushToast("success", `🎉 ${message}`);

    // Persistent inbox entry — survives the user navigating away or
    // refreshing the tab. Dedupe by pool so multiple banner re-mounts
    // don't multiply the notification.
    pushNotification({
      wallet: myAddr,
      kind: "win",
      title: `🏆 You won ${formatSol(totalPotLamports)}`,
      body: `Pool ${poolAddress.slice(0, 6)}…${poolAddress.slice(-4)} resolved in your favor.`,
      href: `/pool/private/${poolAddress}`,
      dedupeId: `win-${poolAddress}`,
    });

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Tombola — you won!", {
          body: message,
          tag: `tombola-win-${poolAddress}`,
        });
      } catch {
        // Some browsers throw on Notification with insufficient context — ignore
      }
    }
  }, [resolved, isWinner, myAddr, totalPotLamports, poolAddress, pushToast]);

  if (!resolved || !winner) return null;

  const rpcUrl = connection.rpcEndpoint;
  const winnerStyle = isWinner
    ? {
        borderColor: accent,
        background: `linear-gradient(135deg, ${accent}26, ${accent}0d 60%, transparent)`,
        boxShadow: `0 0 0 1px ${accent}33, 0 8px 30px ${accent}26`,
      }
    : {
        borderColor: `${accent}66`,
        background: `${accent}14`,
      };

  return (
    <div
      className="mt-8 rounded-2xl border p-6 transition"
      style={winnerStyle}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: accent }}
          >
            {isWinner ? "🎉 You won" : "Winner"}
          </p>

          {isWinner ? (
            <h3
              className="mt-1 font-display text-3xl uppercase tabular-nums sm:text-4xl"
              style={{ color: accent }}
            >
              {formatSol(totalPotLamports)} paid to you
            </h3>
          ) : (
            <p className="mt-1 font-mono text-sm text-neutral-200">
              <WalletLink
                wallet={winner}
                rpcUrl={rpcUrl}
                className="text-neutral-200 hover:text-white"
              />
              <span className="ml-2 text-neutral-500">
                won {formatSol(totalPotLamports)}
              </span>
            </p>
          )}

          {/* tx links row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            {settleSig && (
              <a
                href={explorerTxUrl(settleSig, rpcUrl)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
                title={settleSig}
              >
                Settle tx {settleSig.slice(0, 4)}… ↗
              </a>
            )}
            {batchSig && winningBatch && (
              <a
                href={explorerTxUrl(batchSig.signature, rpcUrl)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
                title={`Buy tx for ticket #${winningTicketId?.toString()}`}
              >
                Winning buy {batchSig.signature.slice(0, 4)}… ↗
              </a>
            )}
            {winningTicketId !== null && (
              <span>Ticket #{winningTicketId.toString()}</span>
            )}
          </div>

          {/* Notification permission CTA — only shown when the winner is the
              connected wallet AND the browser supports it AND we haven't
              been granted permission yet. Clicking asks once. */}
          {isWinner && <NotifyOptIn />}
        </div>
      </div>
    </div>
  );
}

function NotifyOptIn() {
  const [perm, setPerm] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPerm(Notification.permission);
  }, []);

  if (perm === null) return null; // SSR / unsupported
  if (perm === "granted") return null; // already opted in
  if (perm === "denied") return null; // can't re-prompt

  const onAsk = async () => {
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
    } catch {
      // ignore — fall back to toast-only
    }
  };

  return (
    <button
      type="button"
      onClick={onAsk}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 hover:text-white"
    >
      Enable browser notifications →
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { address as toAddress, createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, generated } from "@tombola/sdk";

interface Props {
  /** PublicPool PDA. Required — odds only render for live (non-mock) pools. */
  poolAddress: string;
  /** Total tickets in this round; the denominator. */
  totalTickets: bigint;
  /** CSS color string used for the bar fill. Default mint. */
  accentColor?: string;
  /** Hypothetical buy qty being typed in a sibling buy-button. When > 0 the
   *  gauge renders a second "After buying" row showing the post-buy odds
   *  alongside the existing one — live as the input changes. */
  previewQty?: number;
}

// TicketBatch on-chain layout: discriminator(8) + pool(32) + owner(32) + …
const TICKET_BATCH_SIZE = 89n;
const POOL_OFFSET = 8n;
const OWNER_OFFSET = 40n;

/**
 * Per-card "your odds" badge — shown when wallet is connected and the user
 * has at least one ticket in this round. Re-runs whenever `totalTickets`
 * changes, so a pool mutation (own buy or someone else's) refetches the
 * user's stake.
 */
export function WinOdds({
  poolAddress,
  totalTickets,
  accentColor,
  previewQty = 0,
}: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [userTickets, setUserTickets] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setUserTickets(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const owner = publicKey.toBase58();
        const accounts = (await rpc
          .getProgramAccounts(toAddress(PROGRAM_ID), {
            encoding: "base64",
            filters: [
              { dataSize: TICKET_BATCH_SIZE },
              {
                memcmp: {
                  offset: POOL_OFFSET,
                  bytes: poolAddress as never,
                  encoding: "base58",
                },
              },
              {
                memcmp: {
                  offset: OWNER_OFFSET,
                  bytes: owner as never,
                  encoding: "base58",
                },
              },
            ],
          })
          .send()) as unknown as readonly {
          pubkey: string;
          account: { data: readonly [string, "base64"] };
        }[];

        const decoder = generated.getTicketBatchDecoder();
        let total = 0n;
        for (const acc of accounts) {
          const [b64] = acc.account.data;
          const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          const batch = decoder.decode(bytes);
          total += batch.lastTicketId - batch.firstTicketId + 1n;
        }
        if (!cancelled) setUserTickets(total);
      } catch {
        // network blip — keep last-known value
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, poolAddress, totalTickets]);

  // Hide entirely when there's nothing to show — no wallet, no current
  // tickets AND no preview in progress.
  const validPreview = Number.isFinite(previewQty) && previewQty > 0;
  if (!publicKey || userTickets === null) return null;
  if (userTickets === 0n && !validPreview) return null;
  if (totalTickets === 0n && !validPreview) return null;

  // Single mint-default — emerald is not in the brand palette. Callers can
  // override `accentColor` for per-cadence treatments.
  const accent = accentColor ?? "#88cfc4";

  // Current odds (integer-only math on bigints; clamp to [0,100] for the bar).
  const currentPctTimes100 =
    totalTickets > 0n
      ? Number((userTickets * 10_000n) / totalTickets) / 100
      : 0;
  const currentPct = Math.min(100, Math.max(0, currentPctTimes100));

  // Hypothetical post-buy odds when the user has typed a valid preview qty.
  let postPct: number | null = null;
  let postOwned: bigint = 0n;
  let postTotal: bigint = 0n;
  if (validPreview) {
    postOwned = userTickets + BigInt(previewQty);
    postTotal = totalTickets + BigInt(previewQty);
    if (postTotal > 0n) {
      const pctTimes100 = Number((postOwned * 10_000n) / postTotal) / 100;
      postPct = Math.min(100, Math.max(0, pctTimes100));
    }
  }

  // The post-buy bar visualises two segments stacked side-by-side: the user's
  // CURRENT share (solid accent) and the ADDED slice they'd gain by buying
  // (lighter accent). Together they fill `postPct`. Showing the existing
  // share inside the preview bar makes the delta visually unambiguous.
  const previewBaseWidth = userTickets > 0n && postPct !== null
    ? Math.min(postPct, currentPct)
    : 0;
  const previewAddWidth = postPct !== null
    ? Math.max(0, postPct - previewBaseWidth)
    : 0;

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border px-3 py-2"
      style={{
        borderColor: `${accent}33`,
        background: `${accent}0d`,
      }}
    >
      {/* Row 1 — current odds. Shown whenever the user owns tickets, AND
          also when they're previewing a buy (so first-time buyers can see
          their 0% baseline next to the projected post-buy odds). The only
          time this row is omitted is when the user has tickets but isn't
          previewing — that's the standalone-gauge case where the second
          row doesn't exist either, and we just show the single bar. */}
      {(userTickets > 0n || validPreview) && (
        <>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
            <span className="text-neutral-500">
              {validPreview ? "Current odds" : "Your odds"}
            </span>
            <span className="tabular-nums" style={{ color: accent }}>
              {currentPctTimes100.toFixed(2)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${currentPct}%`, background: accent }}
            />
          </div>
          <div className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-neutral-500">
            {userTickets.toString()} of {totalTickets.toString()} ticket
            {totalTickets === 1n ? "" : "s"}
          </div>
        </>
      )}

      {/* Row 2 — live "after buying" projection. Only when the user is
          typing a valid qty in a sibling buy button. */}
      {validPreview && postPct !== null && (
        <>
          <div className="mt-1 border-t border-neutral-800/60" />
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
            <span className="text-neutral-500">After buying</span>
            <span className="tabular-nums" style={{ color: accent }}>
              {postPct.toFixed(2)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
            {/* Two segments — solid current + lighter added — separated by a
                hairline so the delta reads at a glance even on dense bars. */}
            <div className="flex h-full w-full">
              {previewBaseWidth > 0 && (
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${previewBaseWidth}%`,
                    background: accent,
                  }}
                />
              )}
              {previewAddWidth > 0 && (
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${previewAddWidth}%`,
                    background: accent,
                    opacity: 0.5,
                  }}
                />
              )}
            </div>
          </div>
          <div className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-neutral-500">
            {postOwned.toString()} of {postTotal.toString()} ticket
            {postTotal === 1n ? "" : "s"}{" "}
            <span style={{ color: accent }}>
              (+{previewQty})
            </span>
          </div>
        </>
      )}
    </div>
  );
}

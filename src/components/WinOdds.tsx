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
  /** CSS color string used for the bar fill. Default emerald. */
  accentColor?: string;
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
export function WinOdds({ poolAddress, totalTickets, accentColor }: Props) {
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

  if (!publicKey || userTickets === null || userTickets === 0n) return null;
  if (totalTickets === 0n) return null;

  // Percentage with 2 decimals via integer-only math (avoid Number(BigInt) on
  // very large totals), then clamp for the bar width.
  const pctTimes100 = Number((userTickets * 10_000n) / totalTickets) / 100;
  const pctStr = pctTimes100.toFixed(2);
  const pctClamped = Math.min(100, Math.max(0, pctTimes100));

  // When an accent is provided, render the lavender/pink/mint variant with
  // CSS-in-style hex tokens so the same component covers public (default
  // emerald) and private (mint) pages without a Tailwind class explosion.
  if (accentColor) {
    return (
      <div
        className="flex flex-col gap-1 rounded-lg border px-3 py-2"
        style={{
          borderColor: `${accentColor}33`,
          background: `${accentColor}0d`,
        }}
      >
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
          <span className="text-neutral-500">Your odds</span>
          <span className="tabular-nums" style={{ color: accentColor }}>
            {pctStr}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pctClamped}%`, background: accentColor }}
          />
        </div>
        <div className="font-mono text-[10px] tabular-nums uppercase tracking-widest text-neutral-500">
          {userTickets.toString()} of {totalTickets.toString()} ticket
          {totalTickets === 1n ? "" : "s"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">Your odds</span>
        <span className="font-medium tabular-nums text-emerald-300">
          {pctStr}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all duration-500"
          style={{ width: `${pctClamped}%` }}
        />
      </div>
      <div className="text-xs tabular-nums text-neutral-500">
        {userTickets.toString()} of {totalTickets.toString()} ticket
        {totalTickets === 1n ? "" : "s"}
      </div>
    </div>
  );
}

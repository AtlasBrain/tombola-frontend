"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { address as toAddress, createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, generated, type PoolTypeValue } from "@tombola/sdk";
import type { PoolView } from "@/lib/mock-pools";
import { formatSol, formatTickets } from "@/lib/format";

interface Props {
  pools: PoolView[];
}

interface MyTicketsAgg {
  poolAddress: string;
  kind: PoolView["kind"];
  poolType: PoolTypeValue;
  round: bigint;
  tickets: bigint;
  totalSpentLamports: bigint;
}

// TicketBatch on-chain layout: discriminator(8) + pool(32) + owner(32) + ...
// memcmp filters by owner at offset 40; dataSize 89 = TicketBatch fixed size.
const TICKET_BATCH_SIZE = 89n;
const OWNER_OFFSET = 40n;

export function MyTickets({ pools }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [agg, setAgg] = useState<MyTicketsAgg[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setAgg([]);
      setError(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const owner = publicKey.toBase58();
        const result = await rpc
          .getProgramAccounts(toAddress(PROGRAM_ID), {
            encoding: "base64",
            filters: [
              { dataSize: TICKET_BATCH_SIZE },
              {
                memcmp: {
                  offset: OWNER_OFFSET,
                  bytes: owner as never,
                  encoding: "base58",
                },
              },
            ],
          })
          .send();

        const decoder = generated.getTicketBatchDecoder();
        const poolToView = new Map<string, PoolView>();
        for (const p of pools) {
          if (p.poolAddress) poolToView.set(p.poolAddress, p);
        }
        const aggByPool = new Map<string, MyTicketsAgg>();

        for (const acc of result as readonly {
          pubkey: string;
          account: { data: readonly [string, "base64"] };
        }[]) {
          const [b64] = acc.account.data;
          const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
          const batch = decoder.decode(bytes);
          const poolAddr = String(batch.pool);
          const pv = poolToView.get(poolAddr);
          if (!pv || !pv.poolAddress) continue; // skip past-round batches

          const qty = batch.lastTicketId - batch.firstTicketId + 1n;
          const cost = qty * pv.ticketPriceLamports;
          const existing = aggByPool.get(pv.poolAddress);
          if (existing) {
            existing.tickets += qty;
            existing.totalSpentLamports += cost;
          } else {
            aggByPool.set(pv.poolAddress, {
              poolAddress: pv.poolAddress,
              kind: pv.kind,
              poolType: pv.poolType,
              round: pv.round,
              tickets: qty,
              totalSpentLamports: cost,
            });
          }
        }

        if (!cancelled) setAgg([...aggByPool.values()]);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, pools]);

  if (!publicKey) return null;
  if (agg.length === 0 && !error) return null;

  return (
    <section className="mb-12">
      <h2 className="mb-6 text-xl font-semibold">Your tickets</h2>
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-400">
          Couldn&apos;t load your tickets: {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agg.map((a) => (
            <div
              key={a.poolAddress}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-200">
                  {a.kind}
                </span>
                <span className="text-xs tabular-nums text-neutral-500">
                  Round #{a.round.toString()}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: "#88cfc4" }}>
                {formatTickets(a.tickets)}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  tickets
                </span>
              </div>
              <div className="mt-1 text-xs tabular-nums text-neutral-400">
                Spent {formatSol(a.totalSpentLamports)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

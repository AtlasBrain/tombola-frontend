"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { RaffleClient, type PoolTypeValue } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { formatSol } from "@/lib/format";
import { useToast } from "./Toast";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  ticketPriceLamports: bigint;
  closed: boolean;
}

const MIN_QTY = 1;
const MAX_QTY = 100;

export function BuyTicketButton({
  poolType,
  round,
  ticketPriceLamports,
  closed,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { push: pushToast } = useToast();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setErr(null);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyer = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const { instruction } = await client.buyTicketPublic({
        buyer,
        poolType,
        round,
        quantity: BigInt(qty),
      });
      const tx = new Transaction().add(kitToWeb3(instruction));
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      // No router.refresh() here — LivePoolWatcher's accountSubscribe
      // picks up the pool mutation and triggers the refetch (debounced).
      pushToast(
        "success",
        `Bought ${qty} ticket${qty === 1 ? "" : "s"} ✓`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      pushToast("error", msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
      console.error("buy ticket failed:", e);
    } finally {
      setBusy(false);
    }
  }, [connection, publicKey, sendTransaction, poolType, round, qty, pushToast]);

  if (closed) {
    return (
      <button
        type="button"
        disabled
        className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        Round closed
      </button>
    );
  }

  if (!publicKey) {
    return (
      <button
        type="button"
        disabled
        className="mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        title="Connect a wallet to buy"
      >
        Connect wallet to buy
      </button>
    );
  }

  const total = BigInt(qty) * ticketPriceLamports;
  const decrementDisabled = qty <= MIN_QTY || busy;
  const incrementDisabled = qty >= MAX_QTY || busy;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/50 px-2 py-1">
        <button
          type="button"
          aria-label="decrease quantity"
          onClick={() => setQty((q) => Math.max(MIN_QTY, q - 1))}
          disabled={decrementDisabled}
          className="grid h-8 w-8 place-items-center rounded-md text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
        >
          −
        </button>
        <span className="tabular-nums text-sm font-medium text-neutral-100">
          {qty} ticket{qty === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          aria-label="increase quantity"
          onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
          disabled={incrementDisabled}
          className="grid h-8 w-8 place-items-center rounded-md text-neutral-300 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        {busy ? "Buying…" : `Buy — ${formatSol(total)}`}
      </button>
      {err && (
        <p className="text-xs text-rose-400 break-words" title={err}>
          {err.length > 80 ? err.slice(0, 80) + "…" : err}
        </p>
      )}
    </div>
  );
}

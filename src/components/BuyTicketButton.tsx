"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { RaffleClient, type PoolTypeValue } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  closed: boolean;
}

export function BuyTicketButton({ poolType, round, closed }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setErr(null);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      // The instruction builder reads only `.address` off the buyer signer,
      // so a stub object is enough — wallet-adapter signs the wrapping tx.
      const buyer = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const { instruction } = await client.buyTicketPublic({
        buyer,
        poolType,
        round,
        quantity: 1n,
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
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      console.error("buy ticket failed:", e);
    } finally {
      setBusy(false);
    }
  }, [connection, publicKey, sendTransaction, poolType, round, router]);

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

  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        {busy ? "Buying…" : "Buy ticket — 0.01 SOL"}
      </button>
      {err && (
        <p className="text-xs text-rose-400 break-words" title={err}>
          {err.length > 80 ? err.slice(0, 80) + "…" : err}
        </p>
      )}
    </div>
  );
}

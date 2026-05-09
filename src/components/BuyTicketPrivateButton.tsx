"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import {
  createSolanaRpc,
  getProgramDerivedAddress,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { PROGRAM_ID, RaffleClient } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { formatSol } from "@/lib/format";
import { useToast } from "./Toast";

interface Props {
  poolAddress: string;
  ticketPriceLamports: bigint;
  closed: boolean;
}

const MIN_QTY = 1;
const MAX_QTY = 100;

export function BuyTicketPrivateButton({
  poolAddress,
  ticketPriceLamports,
  closed,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [whitelisted, setWhitelisted] = useState<boolean | null>(null);

  // Whitelisted PDA check (re-derived per (pool, wallet) tuple)
  useEffect(() => {
    if (!publicKey) {
      setWhitelisted(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const [whitelistedPda] = await getProgramDerivedAddress({
          programAddress: PROGRAM_ID as Address,
          seeds: [
            new TextEncoder().encode("whitelisted"),
            base58ToBytes(poolAddress),
            base58ToBytes(publicKey.toBase58()),
          ],
        });
        const acc = await rpc
          .getAccountInfo(whitelistedPda as never, { encoding: "base64" })
          .send();
        if (!cancelled) setWhitelisted(!!acc.value);
      } catch {
        if (!cancelled) setWhitelisted(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, poolAddress]);

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction) {
      setWalletModalVisible(true);
      return;
    }
    setBusy(true);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const { instruction } = await client.buyTicketPrivate({
        buyer: buyerSigner,
        pool: poolAddress as never,
        quantity: BigInt(qty),
      });
      const tx = new Transaction().add(kitToWeb3(instruction));
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      pushToast("success", `Bought ${qty} ticket${qty === 1 ? "" : "s"} ✓`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", msg.slice(0, 100));
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    setWalletModalVisible,
    connection,
    poolAddress,
    qty,
    pushToast,
  ]);

  if (closed) {
    return (
      <button
        type="button"
        disabled
        className="mt-6 w-full rounded bg-neutral-800 px-4 py-3 text-sm uppercase text-neutral-500"
      >
        Round closed
      </button>
    );
  }
  if (!publicKey) {
    return (
      <button
        type="button"
        onClick={() => setWalletModalVisible(true)}
        className="mt-6 w-full rounded bg-emerald-600 px-4 py-3 font-semibold text-white"
      >
        Connect wallet
      </button>
    );
  }
  if (whitelisted === null) {
    return (
      <button
        type="button"
        disabled
        className="mt-6 w-full rounded bg-neutral-800 px-4 py-3 text-sm uppercase text-neutral-500"
      >
        Checking whitelist…
      </button>
    );
  }
  if (!whitelisted) {
    return (
      <p className="mt-6 rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        You need an invite code for this pool. Ask the creator for a redemption link.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="qty" className="text-sm text-neutral-400">
          Quantity:
        </label>
        <input
          id="qty"
          type="number"
          min={MIN_QTY}
          max={MAX_QTY}
          value={qty}
          onChange={(e) =>
            setQty(
              Math.max(
                MIN_QTY,
                Math.min(MAX_QTY, Number(e.target.value) || 1),
              ),
            )
          }
          className="w-20 rounded bg-neutral-800 px-3 py-2 text-neutral-100"
        />
        <span className="text-sm text-neutral-500">
          = {formatSol(ticketPriceLamports * BigInt(qty))}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {busy ? "Buying…" : `Buy ${qty} ticket${qty === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

function base58ToBytes(s: string): Uint8Array {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const c of s) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("invalid base58");
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

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
  accentColor?: string;
  ticketPriceSol?: number;
}

const MIN_QTY = 1;
const MAX_QTY = 100;

export function BuyTicketPrivateButton({
  poolAddress,
  ticketPriceLamports,
  closed,
  accentColor = "var(--mint)",
  ticketPriceSol,
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

  const priceSolDisplay =
    ticketPriceSol ?? Number(ticketPriceLamports) / 1_000_000_000;

  if (closed) {
    return (
      <button
        type="button"
        disabled
        style={{ ["--tear-bg" as never]: "#2a2a2f" }}
        className="btn-fx fx-tear mt-6 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-neutral-500 transition disabled:cursor-not-allowed"
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
        style={{ ["--tear-bg" as never]: accentColor }}
        className="btn-fx fx-tear mt-6 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-black transition hover:brightness-110"
        title="Connect a wallet to buy"
      >
        BUY 1 TICKET <span className="font-mono opacity-70">· {priceSolDisplay.toFixed(2)} SOL</span>
      </button>
    );
  }
  if (whitelisted === null) {
    return (
      <button
        type="button"
        disabled
        style={{ ["--tear-bg" as never]: "#2a2a2f" }}
        className="btn-fx fx-tear mt-6 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-neutral-500 transition disabled:cursor-not-allowed"
      >
        Checking whitelist…
      </button>
    );
  }
  if (!whitelisted) {
    return (
      <p className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        You need an invite code for this pool. Ask the creator for a redemption link.
      </p>
    );
  }

  const total = ticketPriceLamports * BigInt(qty);

  return (
    <div className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span>Quantity ({MIN_QTY}–{MAX_QTY})</span>
          <span className="tabular-nums">= {formatSol(total)}</span>
        </div>
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
          disabled={busy}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 tabular-nums outline-none transition focus:border-[color:var(--mint)]/40 focus:ring-2 focus:ring-[color:var(--mint)]/20 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Number of tickets to buy"
        />
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{ ["--tear-bg" as never]: accentColor }}
        className="btn-fx fx-tear mt-0 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy
          ? "BUYING…"
          : <>BUY {qty} TICKET{qty === 1 ? "" : "S"} <span className="font-mono opacity-70">· {formatSol(total)}</span></>}
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

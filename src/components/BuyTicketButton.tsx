"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { RaffleClient, type PoolTypeValue } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { formatSol } from "@/lib/format";
import { pushNotification } from "@/lib/notifications";
import { useToast } from "./Toast";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  ticketPriceLamports: bigint;
  closed: boolean;
  accentColor?: string;
  ticketPriceSol?: number;
  /** Total tickets sold so far in this round. Used for the live odds preview. */
  totalTickets?: bigint;
  /** Either pass `myCurrentTickets` directly OR pass `batches` and let the
   *  button reduce it client-side using the connected wallet. Public pool
   *  page passes batches because it's a server component without access to
   *  publicKey. */
  myCurrentTickets?: bigint;
  /** Minimal batch view used to compute `myCurrentTickets` when not provided. */
  batches?: ReadonlyArray<{ owner: string; quantity: bigint }>;
}

const MIN_QTY = 1;
const MAX_QTY = 100;

export function BuyTicketButton({
  poolType,
  round,
  ticketPriceLamports,
  closed,
  accentColor = "var(--lavender)",
  ticketPriceSol = 0.01,
  totalTickets,
  myCurrentTickets,
  batches,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
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
      // Sign-only flow: ask the wallet to sign without broadcasting. Phantom
      // and Solflare otherwise broadcast via their own RPC (devnet) instead
      // of the dapp's connection (localnet/whatever NEXT_PUBLIC_SOLANA_RPC_URL
      // points at). The wallet will still simulate against its own cluster
      // and may show a red "transaction may fail" warning — clicking
      // Approve through the warning is correct on a localnet/custom RPC.
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
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
      pushNotification({
        wallet: publicKey.toBase58(),
        kind: "purchase",
        title: `Bought ${qty} ticket${qty === 1 ? "" : "s"}`,
        body: `${formatSol(BigInt(qty) * ticketPriceLamports)} · round ${round.toString()}`,
        href: "/#pools",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      pushToast("error", msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
      console.error("buy ticket failed:", e);
    } finally {
      setBusy(false);
    }
  }, [connection, publicKey, signTransaction, poolType, round, qty, ticketPriceLamports, pushToast]);

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
        BUY 1 TICKET <span className="font-mono opacity-70">· {ticketPriceSol.toFixed(2)} SOL</span>
      </button>
    );
  }

  const qtyValid = qty >= MIN_QTY && qty <= MAX_QTY;
  const total = qtyValid ? BigInt(qty) * ticketPriceLamports : 0n;

  function onQtyChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Empty string while editing is fine; clamp on commit. Strip non-digits so
    // "10e5" / "1.5" don't sneak through Safari's lax `type="number"` parser.
    const raw = e.target.value.replace(/[^\d]/g, "");
    if (raw === "") {
      setQty(NaN); // visual empty until user types or blurs
      return;
    }
    setQty(Number(raw));
  }

  function onQtyBlur() {
    if (!Number.isFinite(qty) || qty < MIN_QTY) setQty(MIN_QTY);
    else if (qty > MAX_QTY) setQty(MAX_QTY);
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>Quantity (1–{MAX_QTY})</span>
          <span className="tabular-nums">
            {qtyValid ? `= ${formatSol(total)}` : "—"}
          </span>
        </div>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_QTY}
          max={MAX_QTY}
          step={1}
          value={Number.isFinite(qty) ? qty : ""}
          onChange={onQtyChange}
          onBlur={onQtyBlur}
          disabled={busy}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 tabular-nums outline-none transition focus:border-[#c9b5dc]/40 focus:ring-2 focus:ring-[#c9b5dc]/20 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Number of tickets to buy"
        />
        {(() => {
          // Live odds preview — only renders when the caller passed totalTickets.
          if (totalTickets === undefined) return null;
          if (!qtyValid) return null;
          // Compute caller's existing tickets either from prop or by reducing
          // batches against the connected wallet.
          let mine = myCurrentTickets;
          if (mine === undefined && batches && publicKey) {
            const me = publicKey.toBase58();
            let n = 0n;
            for (const b of batches) if (b.owner === me) n += b.quantity;
            mine = n;
          }
          if (mine === undefined) mine = 0n;
          const postOwned = mine + BigInt(qty);
          const postTotal = totalTickets + BigInt(qty);
          if (postTotal === 0n) return null;
          const pct =
            Number(postOwned * 10_000n) / Number(postTotal) / 100;
          return (
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              After buying:{" "}
              <span className="tabular-nums text-neutral-300">
                {postOwned.toString()} / {postTotal.toString()}
              </span>{" "}
              ={" "}
              <span
                className="tabular-nums"
                style={{ color: accentColor }}
              >
                {pct.toFixed(pct < 1 ? 2 : 1)}%
              </span>{" "}
              chance to win
            </p>
          );
        })()}
      </label>
      <button
        type="button"
        disabled={busy || !qtyValid}
        onClick={onClick}
        aria-label={
          busy
            ? "Buying…"
            : qtyValid
              ? `Buy ${qty} ticket${qty === 1 ? "" : "s"} — ${formatSol(total)}`
              : "Enter a quantity"
        }
        style={{ ["--tear-bg" as never]: accentColor }}
        className="btn-fx fx-tear mt-0 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy
          ? "Buying…"
          : qtyValid
            ? <>BUY {qty} TICKET{qty === 1 ? "" : "S"} <span className="font-mono opacity-70">· {ticketPriceSol.toFixed(2)} SOL</span></>
            : "Enter a quantity"}
      </button>
      {err && (
        <p className="text-xs text-rose-400 break-words" title={err}>
          {err.length > 80 ? err.slice(0, 80) + "…" : err}
        </p>
      )}
    </div>
  );
}

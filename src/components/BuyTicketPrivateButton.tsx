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
import { decodeBase58 } from "@/lib/base58";
import { formatSol } from "@/lib/format";
import { pushNotification } from "@/lib/notifications";
import { useToast } from "./Toast";
import { loadCodesFromStorage } from "@/lib/private-pool-storage";

interface Props {
  poolAddress: string;
  ticketPriceLamports: bigint;
  closed: boolean;
  accent?: string;
  ticketPriceSol?: number;
  /** Creator wallet — when the connected wallet matches, the
   *  "Not whitelisted" gate is replaced by a one-click self-whitelist
   *  button that redeems one of the creator's own pool codes. The
   *  protocol doesn't grant creators an automatic seat on their own
   *  pool, so this is a UX shim on top of the existing redeem flow. */
  creator?: string;
  /** Soft UI cap on tickets per buy. Defaults to MAX_QTY_HARD. The hard cap
   *  is enforced on-chain by `buy_ticket_private` against pool's total_tickets
   *  bound; this prop lets the creator hint a smaller cap for fairness UI
   *  (e.g. "max 10 per buyer"). NOT a security guarantee — a determined
   *  buyer could call the program directly. */
  maxTicketsPerBuy?: number;
  /** Called after a successful buy. Lets the parent bump a reload key so
   *  the page state refetches immediately (LivePoolWatcher's router.refresh
   *  is a no-op on a client-component page). */
  onPurchased?: () => void;
  /** Fired whenever the qty input changes (empty / out-of-range → 0). Lets
   *  the parent show a live "after-buying" overlay on the WinOdds gauge. */
  onQtyChange?: (qty: number) => void;
}

const MIN_QTY = 1;
const MAX_QTY_HARD = 100;

export function BuyTicketPrivateButton({
  poolAddress,
  ticketPriceLamports,
  closed,
  accent = "var(--mint)",
  ticketPriceSol,
  maxTicketsPerBuy = MAX_QTY_HARD,
  onPurchased,
  onQtyChange,
  creator,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  // qty = NaN represents the "input is temporarily empty" state while the user
  // is typing. Clamped to MIN/MAX on blur. See onQtyChange / onQtyBlur below.
  const [qty, setQty] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [whitelisted, setWhitelisted] = useState<boolean | null>(null);
  const MAX_QTY = Math.max(MIN_QTY, Math.min(MAX_QTY_HARD, maxTicketsPerBuy));
  const qtyValid =
    Number.isFinite(qty) && qty >= MIN_QTY && qty <= MAX_QTY;
  // The qty input is only visible to a connected, whitelisted buyer on an
  // open round. In every other branch we render a substitute (Round closed,
  // Connect, Checking whitelist…, Not whitelisted). Emit 0 in those cases so
  // a sibling gauge stays in idle mode rather than showing a stuck preview.
  const qtyVisible = !closed && !!publicKey && whitelisted === true;

  // Push qty up so a parent can overlay it on the WinOdds gauge. Declared
  // BEFORE the early returns so hook order stays stable across renders.
  useEffect(() => {
    onQtyChange?.(qtyVisible && qtyValid ? qty : 0);
  }, [qty, qtyValid, qtyVisible, onQtyChange]);

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
            decodeBase58(poolAddress),
            decodeBase58(publicKey.toBase58()),
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
      pushNotification({
        wallet: publicKey.toBase58(),
        kind: "purchase",
        title: `Bought ${qty} ticket${qty === 1 ? "" : "s"}`,
        body: `${formatSol(ticketPriceLamports * BigInt(qty))} · private pool`,
        href: `/pool/private/${poolAddress}`,
      });
      onPurchased?.();
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
    ticketPriceLamports,
    pushToast,
    onPurchased,
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
        style={{ ["--tear-bg" as never]: accent }}
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
    const isCreator =
      creator !== undefined && publicKey.toBase58() === creator;
    if (isCreator) {
      return (
        <CreatorSelfWhitelist
          poolAddress={poolAddress}
          accent={accent}
          onWhitelisted={() => setWhitelisted(true)}
        />
      );
    }
    return (
      <p className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        You need an invite code for this pool. Ask the creator for a redemption link.
      </p>
    );
  }

  const total = qtyValid ? ticketPriceLamports * BigInt(qty) : 0n;

  function handleQtyInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Empty input is a valid "still typing" state — store NaN, render "", clamp on blur.
    const raw = e.target.value.replace(/[^\d]/g, "");
    if (raw === "") {
      setQty(NaN);
      return;
    }
    setQty(Number(raw));
  }
  function handleQtyBlur() {
    if (!Number.isFinite(qty) || qty < MIN_QTY) setQty(MIN_QTY);
    else if (qty > MAX_QTY) setQty(MAX_QTY);
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          <span>Quantity ({MIN_QTY}–{MAX_QTY})</span>
          <span className="tabular-nums">
            {qtyValid ? `= ${formatSol(total)}` : "—"}
          </span>
        </div>
        <input
          id="qty"
          type="number"
          inputMode="numeric"
          min={MIN_QTY}
          max={MAX_QTY}
          step={1}
          value={Number.isFinite(qty) ? qty : ""}
          onChange={handleQtyInput}
          onBlur={handleQtyBlur}
          disabled={busy}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-100 tabular-nums outline-none transition focus:border-[color:var(--mint)]/40 focus:ring-2 focus:ring-[color:var(--mint)]/20 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Number of tickets to buy"
        />
      </label>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || !qtyValid}
        style={{ ["--tear-bg" as never]: accent }}
        className="btn-fx fx-tear mt-0 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
          "BUYING…"
        ) : !qtyValid ? (
          "Enter a quantity"
        ) : (
          <>
            BUY {qty} TICKET{qty === 1 ? "" : "S"}{" "}
            <span className="font-mono opacity-70">· {formatSol(total)}</span>
          </>
        )}
      </button>
    </div>
  );
}

/** Creator-only self-whitelist button. Shown above the buy UI when the
 *  connected wallet IS the pool creator AND no Whitelisted PDA exists
 *  for them yet. Pulls one of the creator's own pool codes from
 *  localStorage and runs the existing redeemInviteCodeWhitelist
 *  instruction — same on-chain path any invitee takes, just initiated
 *  by the creator using one of their own reserved codes.
 *
 *  If localStorage doesn't have codes for this pool (e.g. creator is
 *  on a different browser), we explain and link to a manual redeem. */
function CreatorSelfWhitelist({
  poolAddress,
  accent,
  onWhitelisted,
}: {
  poolAddress: string;
  accent: string;
  onWhitelisted: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { push: pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  // Look up the codes synchronously — localStorage access is cheap and
  // the result only changes when the wallet changes.
  const stored = publicKey
    ? loadCodesFromStorage(poolAddress, publicKey.toBase58())
    : null;
  const hasCodes = !!stored && stored.codes.length > 0;

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction || !stored || stored.codes.length === 0) {
      return;
    }
    setBusy(true);
    try {
      // Use the LAST code in the list so it doesn't collide with codes
      // the creator is likely to allocate to friends from the head of
      // the list. Both ends of the array are unguessable bearer
      // strings, but consistent ordering avoids confusion.
      const code = stored.codes[stored.codes.length - 1];
      const proof = stored.proofs[code] ?? [];

      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const ix = await client.redeemInviteCodeWhitelist({
        buyer: buyerSigner,
        pool: poolAddress as never,
        code,
        proof,
      });
      const tx = new Transaction().add(kitToWeb3(ix));
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
      pushToast("success", "You're on the whitelist ✓");
      onWhitelisted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", msg.slice(0, 120));
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    stored,
    connection,
    poolAddress,
    pushToast,
    onWhitelisted,
  ]);

  if (!hasCodes) {
    return (
      <p className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        You created this pool, but the codes aren&apos;t in this browser —
        open the original browser session, or paste a redemption link from
        your saved codes to whitelist yourself.
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-[color:var(--mint)]/40 bg-neutral-900/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Creator
      </p>
      <p className="mt-1 text-sm text-neutral-200">
        You created this pool. One click to whitelist yourself with one of
        your own codes — same on-chain redeem as any invitee.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{ ["--tear-bg" as never]: accent }}
        className="btn-fx fx-tear mt-3 flex w-full items-center justify-center gap-2 px-4 py-3 font-display text-sm uppercase text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "WHITELISTING…" : "WHITELIST MYSELF"}
      </button>
    </div>
  );
}


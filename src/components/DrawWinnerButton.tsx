"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import {
  createSolanaRpc,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { useToast } from "./Toast";

/**
 * Private-pool admin actions. The keeper daemon (Project Tombola, D-071)
 * handles the entire commit/settle cycle for private pools, so the manual
 * draw button is gone — it was dead weight and only worked for 1-ticket
 * pools anyway.
 *
 * What's left here is the one path the daemon CANNOT handle:
 *   - close_empty_private_pool requires the creator's signature, so when
 *     a pool closes with zero tickets sold the creator alone can reclaim
 *     the rent. We surface that as a clear "Reclaim rent" CTA.
 *
 * Plus a "stuck" notice for the rare case where AwaitingVrf has been
 * pending for >1h with no reveal — private pools have no on-chain retry
 * path so the only recovery is the operator team. Keep the message; users
 * shouldn't see anything actionable.
 *
 * The component name is kept as "DrawWinnerButton" only to avoid an
 * import-rename churn across the existing pages that wire it in.
 */

interface Props {
  poolAddress: string;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: bigint;
  creator: string;
}

const RETRY_TIMEOUT_SECS = 3_600;

export function DrawWinnerButton({
  poolAddress,
  state,
  closeTimeUnix,
  totalTickets,
  creator,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  const nowSec = Math.floor(Date.now() / 1000);
  const closed = closeTimeUnix <= nowSec;
  const closeTimeoutPassed = closeTimeUnix + RETRY_TIMEOUT_SECS <= nowSec;
  const isCreator = publicKey?.toBase58() === creator;
  const stuck = state === 1 && closeTimeoutPassed;
  const reclaimable = state === 0 && closed && totalTickets === 0n;

  const onReclaim = useCallback(async () => {
    if (!publicKey || !signTransaction) {
      setWalletModalVisible(true);
      return;
    }
    if (publicKey.toBase58() !== creator) {
      pushToast("error", "Only the pool creator can reclaim rent.");
      return;
    }
    setBusy(true);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const creatorSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const ix = await client.closeEmptyPrivatePool({
        creator: creatorSigner,
        pool: poolAddress as Address,
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
      pushToast("success", "Pool closed; rent refunded to your wallet.");
    } catch (e: unknown) {
      pushToast(
        "error",
        (e instanceof Error ? e.message : String(e)).slice(0, 200),
      );
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    creator,
    connection,
    poolAddress,
    pushToast,
    setWalletModalVisible,
  ]);

  // Resolved or fully open with time remaining: nothing to surface.
  if (state === 2) return null;
  if (state === 0 && !closed) return null;

  // AwaitingVrf or closed-with-tickets: keeper handles it. Buyers + creators
  // see a passive status. Creators see a slightly different copy (they own
  // the pool) but no actionable button — the daemon is the actor.
  if (state === 1 || (state === 0 && closed && totalTickets > 0n)) {
    if (stuck) {
      return (
        <div className="mt-6 rounded-2xl border border-amber-700/40 bg-amber-900/20 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
            Draw delayed
          </p>
          <p className="mt-1 text-sm text-amber-200">
            The oracle hasn&apos;t revealed within an hour of close. Private
            pools have no on-chain retry path; the operator team needs to
            recover this round manually.
          </p>
        </div>
      );
    }
    const message =
      state === 1
        ? "Drawing winner — oracle reveal landed; settle is being submitted."
        : "Round closed — the keeper will draw a winner shortly. You'll be notified if you win.";
    return (
      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Status
        </p>
        <p className="mt-1 text-sm text-neutral-300">{message}</p>
      </div>
    );
  }

  // Empty pool: only the creator can close it. Show reclaim CTA when
  // they're connected; show a passive message to non-creators.
  if (reclaimable) {
    if (!isCreator) {
      return (
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Status
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            Round closed with zero tickets sold. The pool creator can
            reclaim rent.
          </p>
        </div>
      );
    }
    return (
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onReclaim}
          disabled={busy}
          className="rounded-lg bg-amber-600 px-4 py-3 font-display text-xs uppercase tracking-widest text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
        >
          {busy ? "Reclaiming…" : "Reclaim rent"}
        </button>
        <p className="text-xs text-neutral-500">
          Closes the empty pool and refunds the rent (~0.002 SOL) to your
          wallet. No tickets were sold so there&apos;s nothing to draw.
        </p>
      </div>
    );
  }

  return null;
}

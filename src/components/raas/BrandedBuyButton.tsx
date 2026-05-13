"use client";

import { useCallback, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type Address, type TransactionSigner } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk-v2";
import { kitToWeb3 } from "@/lib/kit-to-web3";

interface Props {
  poolPubkey: string;
  /** BigInt as string — matches PoolFetchedState.ticket_price_lamports */
  ticketPriceLamports: string;
  /** Current pool.total_tickets — required to derive the TicketBatch PDA. */
  totalTickets: number;
  tenantPrimaryColor: string;
}

const MIN_QTY = 1;
const MAX_QTY = 100;

/**
 * Standalone buy button for PublicMode pools. Targets sdk-v2 directly via
 * `RaffleClient.buyTicketPublicMode` — does NOT wrap the v1 BuyTicketPrivateButton.
 */
export function BrandedBuyButton({
  poolPubkey,
  ticketPriceLamports,
  totalTickets,
  tenantPrimaryColor,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useUnifiedSigner();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [qty, setQty] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const priceLamports = BigInt(ticketPriceLamports);
  const totalLamports = priceLamports * BigInt(qty);
  const totalSol = (Number(totalLamports) / 1_000_000_000).toFixed(4);

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction) {
      setWalletModalVisible(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });

      const buyerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const kitIx = await client.buyTicketPublicMode({
        buyer: buyerSigner,
        pool: poolPubkey as Address,
        totalTickets: BigInt(totalTickets),
        quantity: BigInt(qty),
      });

      const tx = new Transaction().add(kitToWeb3(kitIx));
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
      setSuccess(`Bought ${qty} ticket${qty === 1 ? "" : "s"} ✓`);
      // Refresh page data after a short delay to pick up updated pool state.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.slice(0, 150));
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    setWalletModalVisible,
    connection,
    poolPubkey,
    totalTickets,
    qty,
  ]);

  return (
    <div
      className="flex flex-col gap-3"
      style={{ "--tenant-accent": tenantPrimaryColor } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-400" htmlFor="branded-qty">
          Qty
        </label>
        <input
          id="branded-qty"
          type="number"
          min={MIN_QTY}
          max={MAX_QTY}
          value={qty}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setQty(Math.max(MIN_QTY, Math.min(MAX_QTY, v)));
          }}
          className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-center text-sm"
          disabled={busy}
        />
        <span className="text-sm text-neutral-400">{totalSol} SOL</span>
      </div>

      <button
        onClick={onClick}
        disabled={busy || !qty}
        className="rounded-md px-6 py-3 font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: tenantPrimaryColor }}
      >
        {busy ? "Sending…" : publicKey ? `Buy ${qty} Ticket${qty === 1 ? "" : "s"}` : "Connect Wallet"}
      </button>

      {success && (
        <p className="text-sm font-medium text-green-400">{success}</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

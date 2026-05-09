"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { useToast } from "./Toast";
import type { RedemptionLinkParams } from "@/lib/private-pools";

interface Props {
  params: RedemptionLinkParams;
}

export function RedeemButton({ params }: Props) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction) {
      setWalletModalVisible(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ix: any;
      if (params.mode === "Whitelist") {
        ix = await client.redeemInviteCodeWhitelist({
          buyer: buyerSigner,
          pool: params.pool as never,
          code: params.code,
          proof: params.proof,
        });
      } else {
        ix = await client.redeemInviteCodeOneTicket({
          buyer: buyerSigner,
          pool: params.pool as never,
          code: params.code,
          proof: params.proof,
        });
      }

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

      pushToast(
        "success",
        params.mode === "Whitelist"
          ? "You're whitelisted ✓"
          : "1 ticket purchased ✓",
      );
      router.push(`/pool/private/${params.pool}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.length > 200 ? msg.slice(0, 200) + "…" : msg);
      pushToast("error", msg.slice(0, 100));
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    setWalletModalVisible,
    connection,
    params,
    pushToast,
    router,
  ]);

  if (!publicKey) {
    return (
      <button
        type="button"
        onClick={() => setWalletModalVisible(true)}
        className="rounded bg-emerald-600 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-500"
      >
        Connect wallet to redeem
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded bg-emerald-600 px-6 py-3 text-base font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {busy
          ? "Redeeming…"
          : params.mode === "Whitelist"
            ? "Redeem invite (you'll be whitelisted)"
            : "Redeem invite (auto-purchases 1 ticket)"}
      </button>
      {err && (
        <p className="text-sm text-red-400" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

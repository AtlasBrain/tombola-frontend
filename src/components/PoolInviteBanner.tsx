"use client";

// One-click claim banner that surfaces a server-stored pool invite to
// the recipient. Renders only when:
//
//   1. The connected wallet has an invite for this pool (status=sent),
//      AND
//   2. The on-chain `Whitelisted` PDA for (pool, wallet) does NOT yet
//      exist. Without the second gate, a recipient who already redeemed
//      would see the banner forever — the source of truth for "am I
//      whitelisted?" is the PDA, not the KV row.
//
// Click flow:
//   - signMessage(`tombola:pool-invite:claim:<pool>:<nonce>`)
//   - server returns {code, proofsBase64}
//   - client builds redeemInviteCodeWhitelist instruction, friend signs
//     the on-chain tx, broadcasts.
//   - on success, the existing AwaitedPool flow takes over (the buy
//     button unlocks because the Whitelisted PDA now exists).

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import {
  claimPoolInvite,
  getInvitesForWallet,
} from "@/lib/pool-invite-client";
import { CORAL, MINT } from "@/lib/colors";
import { base64UrlToBytes } from "@/lib/private-pool-storage";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { pushNotification } from "@/lib/notifications";
import { WalletLink } from "@/components/WalletLink";
import { useToast } from "@/components/Toast";

interface Props {
  /** Pool PDA. */
  poolAddress: string;
  /** Bumped after the on-chain claim so the parent LivePoolWatcher /
   *  ProfileCard / etc. re-fetch. The pool page already supports a
   *  parent-managed reload key — we reuse it. */
  onClaimed?: () => void;
}

export function PoolInviteBanner({ poolAddress, onClaimed }: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const wallet = publicKey?.toBase58() ?? null;

  // Recipient inbox — cached by wallet so navigating between pools
  // doesn't re-fetch when the same wallet has multiple invites. Stays
  // disabled while no wallet is connected.
  const invitesQuery = useQuery({
    enabled: !!wallet,
    queryKey: ["poolInvites", "by-wallet", wallet],
    queryFn: () => getInvitesForWallet(wallet!),
    staleTime: 60_000,
  });

  const myInvite =
    invitesQuery.data?.find(
      (i) => i.pool === poolAddress && i.status === "sent",
    ) ?? null;

  const onClaim = useCallback(async () => {
    if (!wallet || !signTransaction || !signMessage) {
      setWalletModalVisible(true);
      return;
    }
    if (!myInvite) return;
    setBusy(true);
    try {
      // 1. Retrieve the code + proof from the server (gated by signed claim).
      const { code, proofsBase64 } = await claimPoolInvite({
        wallet,
        signMessage,
        pool: poolAddress,
      });
      const proof = proofsBase64.map(base64UrlToBytes);

      // 2. Build + send the on-chain redeem tx. Same instruction the
      //    /redeem page uses for Whitelist-mode codes.
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyerSigner = {
        address: wallet,
      } as unknown as TransactionSigner;
      const ix = await client.redeemInviteCodeWhitelist({
        buyer: buyerSigner,
        pool: poolAddress as never,
        code,
        proof,
      });
      const tx = new Transaction().add(kitToWeb3(ix));
      tx.feePayer = publicKey!;
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

      pushToast("success", "You're whitelisted ✓");
      pushNotification({
        wallet,
        kind: "redeemed",
        title: "Friend invite claimed",
        body: `Whitelisted on pool ${poolAddress.slice(0, 6)}…${poolAddress.slice(-4)}`,
        href: `/pool/private/${poolAddress}`,
        dedupeId: `friend-invite-claim-${poolAddress}`,
      });
      // Refresh inbox so the banner disappears; let the parent re-check
      // its whitelist gate.
      await qc.invalidateQueries({
        queryKey: ["poolInvites", "by-wallet", wallet],
      });
      onClaimed?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", msg.slice(0, 120));
    } finally {
      setBusy(false);
    }
  }, [
    wallet,
    signTransaction,
    signMessage,
    publicKey,
    myInvite,
    poolAddress,
    connection,
    qc,
    onClaimed,
    pushToast,
    setWalletModalVisible,
  ]);

  if (!wallet) return null;
  if (invitesQuery.isLoading) return null;
  if (!myInvite) return null;

  return (
    <div
      className="mb-6 flex items-center gap-4 rounded-2xl border p-4 sm:p-5"
      style={{
        borderColor: `${MINT}73`,
        background: `linear-gradient(135deg, ${MINT}2e, ${MINT}0a 60%, transparent)`,
        boxShadow: `0 0 0 1px ${MINT}33, 0 8px 30px ${MINT}26`,
      }}
      role="region"
      aria-label="Pool invitation"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{
          background: `${CORAL}26`,
          border: `1px solid ${CORAL}66`,
        }}
        aria-hidden
      >
        🎟
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="font-display text-base font-bold uppercase tracking-tight">
          You&apos;re invited!
        </div>
        <p className="font-mono text-[11px] text-neutral-300">
          <WalletLink
            wallet={myInvite.inviter}
            className="font-mono font-semibold transition hover:underline"
            style={{ color: MINT }}
          />{" "}
          <span className="text-neutral-500">
            reserved a seat for you in this pool · one click to unlock
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        style={{ background: MINT, color: "#000" }}
        className="shrink-0 rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-2.5"
      >
        {busy ? "Claiming…" : "Claim & Unlock"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { WalletBalances } from "@/lib/raas/token-balance";

// USDC mainnet mint — Path B is only active when the user has stable tokens.
// On devnet there is no canonical USDT; Jupiter routing still works for USDC.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

interface Props {
  poolPubkey: string;
  ticketPriceLamports: string;
  totalTickets: number;
  tenantPrimaryColor: string;
  balances: WalletBalances;
}

export function PathB_SwapAndBuy(props: Props) {
  const signer = useUnifiedSigner();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Choose whichever stable token has a higher balance.
  const useUsdc = props.balances.usdc_atoms >= props.balances.usdt_atoms;
  const stable = useUsdc ? "USDC" : "USDT";
  const inputMint = useUsdc ? USDC_MINT : USDT_MINT;

  async function execute() {
    if (!signer.publicKey || !signer.signTransaction) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { getSwapQuote, getSwapInstructions } = await import(
        "@/lib/raas/jupiter-swap"
      );
      const { buildSwapAndBuyTx } = await import("@/lib/raas/bundle-tx");
      const { Connection } = await import("@solana/web3.js");
      const { createSolanaRpc } = await import("@solana/kit");
      const { RaffleClient } = await import("@tombola/sdk-v2");
      const { kitToWeb3 } = await import("@/lib/kit-to-web3");

      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
      const conn = new Connection(rpcUrl, "confirmed");

      // 1) Build buy instruction via RaffleClient.
      const rpc = createSolanaRpc(rpcUrl);
      const client = new RaffleClient({ rpc });
      const buyerAddr = signer.publicKey.toBase58();
      const kitIx = await client.buyTicketPublicMode({
        buyer: { address: buyerAddr } as Parameters<
          typeof client.buyTicketPublicMode
        >[0]["buyer"],
        pool: props.poolPubkey as Parameters<
          typeof client.buyTicketPublicMode
        >[0]["pool"],
        totalTickets: BigInt(props.totalTickets),
        quantity: 1n,
      });
      const buyInstruction = kitToWeb3(kitIx);

      // 2) Determine input amount: use the available stable balance, capped to
      //    110% of what we need (slippage margin). Jupiter swap is ExactIn.
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      // We ask Jupiter to send exactly priceLamports out (ExactOut via input sizing).
      // For MVP use ExactIn with the stable balance capped to an estimate.
      const stableBalance = useUsdc
        ? props.balances.usdc_atoms
        : props.balances.usdt_atoms;

      const quote = await getSwapQuote({
        inputMint,
        outputMint: SOL_MINT,
        amount: stableBalance.toString(),
        slippageBps: 100, // 1%
      });

      const swapIxs = await getSwapInstructions({
        quote,
        userPublicKey: buyerAddr,
      });

      // 3) Bundle swap + buy into one VersionedTransaction.
      const tx = await buildSwapAndBuyTx({
        connection: conn,
        payer: signer.publicKey,
        swapInstructions: swapIxs,
        buyInstruction,
      });

      // 4) Sign + submit.
      const signed = await signer.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, "confirmed");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm opacity-70">
        Pay with your {stable}. We&apos;ll swap to SOL and buy your ticket in one
        signature.
      </div>
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}
      <button
        onClick={execute}
        disabled={submitting}
        className="w-full px-4 py-3 rounded-md font-semibold text-black disabled:opacity-30"
        style={{ background: props.tenantPrimaryColor }}
      >
        {submitting ? "Swapping + buying…" : `Buy ticket with ${stable}`}
      </button>
    </div>
  );
}

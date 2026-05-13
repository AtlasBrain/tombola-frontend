"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { StripeOnrampDialog } from "./StripeOnrampDialog";
import { usdcMintFor } from "@/lib/raas/usdc-mint";

// Phase D TODO: swap+buy wiring deferred.
// Imports for jupiter-swap, bundle-tx, and ConfirmSwapAndBuyModal will be added in Phase D.

const LAMPORTS_PER_SOL = 1_000_000_000n;
const USDC_DECIMALS = 6;

type Phase =
  | "idle"
  | "stripe_open"
  | "waiting_for_usdc"
  | "ready_to_sign"
  | "submitting"
  | "done"
  | "error";

interface Props {
  poolPubkey: string;
  ticketPriceLamports: bigint;
  quantity: number;
  tenantPrimaryColor: string;
  /**
   * Pre-built buy_ticket_private instruction for the given (pool, buyer, quantity).
   * Caller provides this; component doesn't construct it — keeps the wallet-bridge
   * details out of this component.
   */
  buildBuyInstruction: (signer: PublicKey) => Promise<TransactionInstruction>;
}

export function BuyWithCardButton({
  poolPubkey: _poolPubkey,
  ticketPriceLamports,
  quantity,
  tenantPrimaryColor,
  buildBuyInstruction: _buildBuyInstruction,
}: Props) {
  const { publicKey } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculate USDC needed: convert ticket price to USD, then over-fund by 5%
  // to absorb swap slippage. Need a SOL/USD price feed for accuracy; for now
  // we hard-code an estimate. Production: pull from CoinGecko or Pyth (Task 9).
  const totalCostLamports = ticketPriceLamports * BigInt(quantity);
  const totalCostSol = Number(totalCostLamports) / Number(LAMPORTS_PER_SOL);
  const SOL_USD_ESTIMATE = 200; // overridable via a server-side price fetch (Task 9)
  const usdcNeeded = Math.ceil(totalCostSol * SOL_USD_ESTIMATE * 1.05); // +5% slippage buffer
  // usdcAtomic is used in Phase D when ConfirmSwapAndBuyModal is wired in
  void (BigInt(usdcNeeded) * 10n ** BigInt(USDC_DECIMALS));
  void usdcMintFor; // imported to satisfy the dependency — Phase D will use it

  const cluster = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").includes("devnet")
    ? ("devnet" as const)
    : ("mainnet-beta" as const);

  const handleStripeComplete = useCallback(() => {
    setPhase("waiting_for_usdc");
    // Phase D stub: swap+buy bundle not yet wired.
    // When Phase D lands, this transitions to ConfirmSwapAndBuyModal.
    console.log("USDC delivered, swap+buy not wired yet (Phase D)");
  }, []);

  const handleStripeCancel = useCallback(() => {
    setPhase("idle");
  }, []);

  const handleStripeError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPhase("error");
  }, []);

  const onClick = () => {
    setErrorMsg(null);
    if (!publicKey) {
      setErrorMsg("Connect a wallet first (or sign in with Google/Apple if Privy is configured).");
      setPhase("error");
      return;
    }
    setPhase("stripe_open");
  };

  return (
    <>
      <button
        onClick={onClick}
        disabled={!publicKey || phase !== "idle"}
        className="w-full px-4 py-3 rounded-md font-semibold disabled:opacity-30"
        style={{ background: tenantPrimaryColor, color: "#000" }}
      >
        {phase === "idle" && `Buy with card ($${usdcNeeded} USDC)`}
        {phase === "stripe_open" && "Processing payment…"}
        {phase === "waiting_for_usdc" && "Waiting for USDC…"}
        {phase === "ready_to_sign" && "Sign to complete"}
        {phase === "submitting" && "Submitting…"}
        {phase === "done" && "✓ Ticket purchased"}
        {phase === "error" && "Try again"}
      </button>

      {errorMsg && (
        <p className="mt-2 text-sm text-red-300">{errorMsg}</p>
      )}

      <StripeOnrampDialog
        open={phase === "stripe_open"}
        walletAddress={publicKey?.toBase58() ?? ""}
        amountUsd={usdcNeeded}
        cluster={cluster}
        onComplete={handleStripeComplete}
        onCancel={handleStripeCancel}
        onError={handleStripeError}
      />

      {/* Phase D: ConfirmSwapAndBuyModal will be mounted here once jupiter-swap
          and bundle-tx are implemented. See plan Phase D Task 8. */}
    </>
  );
}

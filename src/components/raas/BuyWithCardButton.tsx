"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { StripeOnrampDialog } from "./StripeOnrampDialog";
import { ConfirmSwapAndBuyModal } from "./ConfirmSwapAndBuyModal";

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
   * Build the buy_ticket_public_mode TransactionInstruction for the given
   * signer. Caller provides this; keeps wallet-bridge details out of here.
   */
  buildBuyInstruction: (signer: PublicKey) => Promise<TransactionInstruction>;
}

export function BuyWithCardButton({
  poolPubkey: _poolPubkey,
  ticketPriceLamports,
  quantity,
  tenantPrimaryColor,
  buildBuyInstruction,
}: Props) {
  const { publicKey, signTransaction } = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculate USDC needed: convert ticket price to USD, then over-fund by 5%
  // to absorb swap slippage.
  // ExactOut mode means Jupiter sizes the swap precisely; the 5% buffer here
  // is only for the Stripe onramp amount (we need to fund slightly more USDC
  // than the swap will consume so the ATA has enough).
  const totalCostLamports = ticketPriceLamports * BigInt(quantity);
  const totalCostSol = Number(totalCostLamports) / Number(LAMPORTS_PER_SOL);
  const SOL_USD_ESTIMATE = 200; // rough estimate for Stripe onramp sizing
  const usdcNeeded = Math.ceil(totalCostSol * SOL_USD_ESTIMATE * 1.05); // +5% buffer
  const usdcAtomic = BigInt(usdcNeeded) * 10n ** BigInt(USDC_DECIMALS);

  const cluster = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").includes("devnet")
    ? ("devnet" as const)
    : ("mainnet-beta" as const);

  const handleStripeComplete = useCallback(() => {
    // USDC delivered — transition to ConfirmSwapAndBuyModal flow.
    setPhase("waiting_for_usdc");
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
      setErrorMsg(
        "Connect a wallet first (or sign in with Google/Apple if Privy is configured).",
      );
      setPhase("error");
      return;
    }
    setPhase("stripe_open");
  };

  const isModalPhase =
    phase === "waiting_for_usdc" ||
    phase === "ready_to_sign" ||
    phase === "submitting";

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

      {errorMsg && <p className="mt-2 text-sm text-red-300">{errorMsg}</p>}

      <StripeOnrampDialog
        open={phase === "stripe_open"}
        walletAddress={publicKey?.toBase58() ?? ""}
        amountUsd={usdcNeeded}
        cluster={cluster}
        onComplete={handleStripeComplete}
        onCancel={handleStripeCancel}
        onError={handleStripeError}
      />

      {isModalPhase && publicKey && signTransaction && (
        <ConfirmSwapAndBuyModal
          phase={phase as "waiting_for_usdc" | "ready_to_sign" | "submitting"}
          setPhase={setPhase}
          setError={(m) => {
            setErrorMsg(m);
            setPhase("error");
          }}
          buyer={publicKey}
          signTransaction={signTransaction}
          usdcAtomicNeeded={usdcAtomic}
          totalCostLamports={totalCostLamports}
          buildBuyInstruction={buildBuyInstruction}
          cluster={cluster}
        />
      )}
    </>
  );
}

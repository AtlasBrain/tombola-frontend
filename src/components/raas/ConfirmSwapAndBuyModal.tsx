"use client";

// ConfirmSwapAndBuyModal
// Rendered after Stripe USDC delivery is confirmed (phase = "waiting_for_usdc").
// Polls the user's USDC ATA, then on "ready_to_sign" builds the swap+buy
// VersionedTransaction, requests a wallet signature, submits, and awaits
// confirmation.

import { useEffect, useRef, useState } from "react";
import {
  Connection,
  PublicKey,
  type Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { getSwapQuote, getSwapInstructions } from "@/lib/raas/jupiter-swap";
import { buildSwapAndBuyTx } from "@/lib/raas/bundle-tx";
import { usdcMintFor } from "@/lib/raas/usdc-mint";

// Dynamically import spl-token to avoid SSR issues.
// We only call getAssociatedTokenAddressSync + getAccount in browser-side effects.
async function getUsdcBalance(
  connection: Connection,
  owner: PublicKey,
  usdcMint: PublicKey,
): Promise<bigint> {
  const { getAssociatedTokenAddressSync, getAccount } = await import(
    "@solana/spl-token"
  );
  const ata = getAssociatedTokenAddressSync(usdcMint, owner);
  try {
    const acct = await getAccount(connection, ata);
    return acct.amount;
  } catch {
    return 0n;
  }
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

type Phase = "waiting_for_usdc" | "ready_to_sign" | "submitting";

interface Props {
  phase: Phase;
  setPhase: (
    p: "idle" | "waiting_for_usdc" | "ready_to_sign" | "submitting" | "done",
  ) => void;
  setError: (msg: string) => void;
  buyer: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    tx: T,
  ) => Promise<T>;
  /** Atomic USDC amount needed (6 decimals) */
  usdcAtomicNeeded: bigint;
  /** SOL lamports needed for the buy (used as ExactOut target) */
  totalCostLamports: bigint;
  /**
   * Build the buy_ticket_public_mode TransactionInstruction for the given signer.
   * Caller provides this; modal doesn't know about pool/quantity details.
   */
  buildBuyInstruction: (signer: PublicKey) => Promise<TransactionInstruction>;
  cluster: "mainnet-beta" | "devnet";
}

export function ConfirmSwapAndBuyModal({
  phase,
  setPhase,
  setError,
  buyer,
  signTransaction,
  usdcAtomicNeeded,
  totalCostLamports,
  buildBuyInstruction,
  cluster,
}: Props) {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    (cluster === "devnet"
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com");

  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buildingRef = useRef(false);

  // ── Phase: waiting_for_usdc ────────────────────────────────────────────────
  // Poll USDC ATA every 3 s until balance ≥ usdcAtomicNeeded.
  useEffect(() => {
    if (phase !== "waiting_for_usdc") return;

    const connection = new Connection(rpcUrl, "confirmed");
    const usdcMint = new PublicKey(usdcMintFor(rpcUrl));

    const poll = async () => {
      try {
        const bal = await getUsdcBalance(connection, buyer, usdcMint);
        setUsdcBalance(bal);
        if (bal >= usdcAtomicNeeded) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPhase("ready_to_sign");
        }
      } catch {
        // network hiccup — keep polling
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, buyer, rpcUrl, usdcAtomicNeeded, setPhase]);

  // ── Phase: ready_to_sign ──────────────────────────────────────────────────
  // Build bundle tx, sign, submit, await confirmation.
  useEffect(() => {
    if (phase !== "ready_to_sign" || buildingRef.current) return;
    buildingRef.current = true;

    const run = async () => {
      try {
        setPhase("submitting");

        const connection = new Connection(rpcUrl, "confirmed");
        const usdcMint = usdcMintFor(rpcUrl);

        // 1. Quote: ExactOut — we want exactly totalCostLamports of SOL.
        //    Jupiter will tell us how much USDC to send.
        const quote = await getSwapQuote({
          inputMint: usdcMint,
          outputMint: SOL_MINT,
          amount: String(totalCostLamports),
          slippageBps: 100, // 1% slippage
          swapMode: "ExactOut",
        });

        // 2. Get swap instructions (not full tx — we need to bundle).
        const swapIxs = await getSwapInstructions({
          quote,
          userPublicKey: buyer.toBase58(),
        });

        // 3. Build buy_ticket_public_mode instruction.
        const buyIx = await buildBuyInstruction(buyer);

        // 4. Compose into one VersionedTransaction.
        const vtx = await buildSwapAndBuyTx({
          connection,
          payer: buyer,
          swapInstructions: swapIxs,
          buyInstruction: buyIx,
        });

        // 5. Sign via wallet adapter (prompts user once).
        const signed = await signTransaction(vtx);

        // 6. Submit.
        const rawTx = (signed as VersionedTransaction).serialize();
        const sig = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // 7. Await finalization.
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        setPhase("done");
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Unknown error during swap+buy";
        setError(msg);
      } finally {
        buildingRef.current = false;
      }
    };

    void run();
  }, [
    phase,
    buyer,
    rpcUrl,
    totalCostLamports,
    buildBuyInstruction,
    signTransaction,
    setPhase,
    setError,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const usdcDisplay = (Number(usdcBalance) / 1_000_000).toFixed(2);
  const usdcNeededDisplay = (Number(usdcAtomicNeeded) / 1_000_000).toFixed(2);
  const solDisplay = (Number(totalCostLamports) / 1_000_000_000).toFixed(4);

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-white">
          {phase === "waiting_for_usdc" && "Waiting for USDC…"}
          {phase === "ready_to_sign" && "Building transaction…"}
          {phase === "submitting" && "Submitting…"}
        </h3>

        {phase === "waiting_for_usdc" && (
          <div className="space-y-1 text-white/70">
            <p>
              USDC balance: <span className="font-mono text-white">${usdcDisplay}</span>{" "}
              / <span className="font-mono">${usdcNeededDisplay}</span> needed
            </p>
            <p className="text-xs">
              Funds usually arrive within 30 s. This page refreshes automatically.
            </p>
          </div>
        )}

        {(phase === "ready_to_sign" || phase === "submitting") && (
          <p className="text-white/70">
            Swapping USDC → SOL and buying{" "}
            <span className="font-mono text-white">{solDisplay} SOL</span>{" "}
            worth of tickets. One wallet signature for both.
          </p>
        )}
      </div>
    </div>
  );
}

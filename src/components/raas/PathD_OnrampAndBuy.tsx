"use client";

import { usePhantom, useModal } from "@phantom/react-sdk";
import { BuyWithCardButton } from "./BuyWithCardButton";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";

interface Props {
  poolPubkey: string;
  ticketPriceLamports: string;
  totalTickets: number;
  tenantPrimaryColor: string;
  tenantDisplayName: string;
  solUsd: number;
}

export function PathD_OnrampAndBuy(props: Props) {
  const { open } = useModal();
  const { isConnected } = usePhantom();

  if (!isConnected) {
    return (
      <div className="space-y-3">
        <div className="text-sm opacity-70">
          New here? Sign in with Google, Apple, or Phantom to create your wallet
          — no extension needed.
        </div>
        <button
          onClick={() => open()}
          className="w-full px-4 py-3 rounded-md font-semibold text-black"
          style={{ background: props.tenantPrimaryColor }}
        >
          Sign in to continue
        </button>
        <div className="text-xs opacity-50">
          A non-custodial Solana wallet is created in seconds. Powered by
          Phantom.
        </div>
      </div>
    );
  }

  // Connected — show the card-buy CTA (Stripe → USDC → Jupiter swap → buy).
  // Build the buy instruction factory for BuyWithCardButton.
  async function buildBuyInstruction(
    signer: PublicKey,
  ): Promise<TransactionInstruction> {
    const { createSolanaRpc } = await import("@solana/kit");
    const { RaffleClient } = await import("@tombola/sdk-v2");
    const { kitToWeb3 } = await import("@/lib/kit-to-web3");
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const rpc = createSolanaRpc(rpcUrl);
    const client = new RaffleClient({ rpc });
    const kitIx = await client.buyTicketPublicMode({
      buyer: { address: signer.toBase58() } as Parameters<
        typeof client.buyTicketPublicMode
      >[0]["buyer"],
      pool: props.poolPubkey as Parameters<
        typeof client.buyTicketPublicMode
      >[0]["pool"],
      totalTickets: BigInt(props.totalTickets),
      quantity: 1n,
    });
    return kitToWeb3(kitIx);
  }

  return (
    <BuyWithCardButton
      poolPubkey={props.poolPubkey}
      ticketPriceLamports={BigInt(props.ticketPriceLamports)}
      quantity={1}
      tenantPrimaryColor={props.tenantPrimaryColor}
      buildBuyInstruction={buildBuyInstruction}
    />
  );
}

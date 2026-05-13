"use client";

import { useEffect, useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import {
  classifyWalletState,
  type WalletState,
} from "@/lib/raas/wallet-state-detector";
import type { WalletBalances } from "@/lib/raas/token-balance";

import { PathA_DirectBuy } from "./PathA_DirectBuy";
import { PathB_SwapAndBuy } from "./PathB_SwapAndBuy";
import { PathC_DepositPanel } from "./PathC_DepositPanel";
import { PathD_OnrampAndBuy } from "./PathD_OnrampAndBuy";

export interface SmartBuyPanelProps {
  poolPubkey: string;
  ticketPriceLamports: string;
  totalTickets: number;
  tenantPrimaryColor: string;
  tenantDisplayName: string;
  solUsd: number;
}

export function SmartBuyPanel(props: SmartBuyPanelProps) {
  const signer = useUnifiedSigner();
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!signer.publicKey) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/r/wallet-balances/${signer.publicKey!.toBase58()}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setBalances(null);
        } else {
          const json = (await res.json()) as {
            sol_lamports: string;
            usdc_atoms: string;
            usdt_atoms: string;
          };
          setBalances({
            sol_lamports: BigInt(json.sol_lamports),
            usdc_atoms: BigInt(json.usdc_atoms),
            usdt_atoms: BigInt(json.usdt_atoms),
          });
        }
      } catch {
        if (!cancelled) setBalances(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signer.publicKey]);

  const state: WalletState = classifyWalletState({
    walletAddress: signer.publicKey?.toBase58() ?? null,
    balances,
    ticketPriceLamports: BigInt(props.ticketPriceLamports),
    solUsd: props.solUsd,
  });

  if (loading) {
    return <div className="text-sm opacity-60">Checking your wallet…</div>;
  }

  switch (state) {
    case "none":
      return <PathD_OnrampAndBuy {...props} />;
    case "has-wallet-with-sol":
      return <PathA_DirectBuy {...props} />;
    case "has-wallet-stable-only":
      return <PathB_SwapAndBuy {...props} balances={balances!} />;
    case "has-wallet-zero-balance":
      return <PathC_DepositPanel {...props} />;
  }
}

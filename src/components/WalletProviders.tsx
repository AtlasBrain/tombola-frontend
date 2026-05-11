"use client";

import { useMemo, useState, type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "./Toast";

// Wallet-adapter modal styles. Imported once at the provider boundary;
// Tailwind layer order keeps our utilities winning where they conflict.
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Top-level wrapper for the Solana connection + wallet UI. Any descendant
 * can call `useConnection()` for the RPC handle or `useWallet()` for the
 * connected wallet's pubkey, signer, and connect/disconnect actions.
 *
 * We intentionally pass `wallets={[]}` — every modern Solana wallet
 * (Phantom, Solflare, Backpack, …) registers itself via the Wallet
 * Standard. The wallet-adapter discovers them at runtime; no hard-coded
 * per-wallet adapter list, no maintenance churn when a new wallet ships.
 *
 * Cluster: devnet for Phase 2 since the program isn't deployed yet. Once
 * the devnet smoke runs and we move toward mainnet, swap `clusterApiUrl`
 * for a paid RPC URL via `NEXT_PUBLIC_SOLANA_RPC_URL`.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet"),
    [],
  );

  // One QueryClient per browser session. Stale time 30s — most on-chain
  // data we cache here (wallet stats, friend lists, weekly activity) does
  // change but not within seconds. Components that need fresher data can
  // pass their own staleTime / refetchInterval in the useQuery options.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>{children}</ToastProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

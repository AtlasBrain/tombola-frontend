"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { usePhantom, useSolana } from "@phantom/react-sdk";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

export interface UnifiedSigner {
  publicKey: PublicKey | null;
  signTransaction:
    | (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>)
    | null;
  source: "phantom-connect" | "wallet-adapter" | "none";
}

/**
 * Bridges Phantom Connect (`useSolana()`) with `@solana/wallet-adapter-react`
 * (`useWallet()`). Returns a unified signer regardless of how the user
 * authenticated. When both are connected (edge case), Phantom Connect wins.
 *
 * Adaptations vs spec due to actual ISolanaChain shape:
 *   - `solana.publicKey` is `string | null` → wrapped with `new PublicKey()`
 *   - `solana.signTransaction` returns `Promise<Transaction | VersionedTransaction>`
 *     (non-generic) → return is cast to `T` to satisfy the generic interface
 */
export function useUnifiedSigner(): UnifiedSigner {
  // Wallet-adapter path (existing)
  const wa = useWallet();
  // Phantom Connect path (new)
  const { isConnected: phantomConnected } = usePhantom();
  const { solana } = useSolana();

  if (phantomConnected && solana && solana.publicKey) {
    return {
      publicKey: new PublicKey(solana.publicKey),
      signTransaction: async <T extends Transaction | VersionedTransaction>(
        tx: T,
      ): Promise<T> => {
        const signed = await solana.signTransaction(tx);
        return signed as T;
      },
      source: "phantom-connect",
    };
  }

  if (wa.connected && wa.publicKey) {
    return {
      publicKey: wa.publicKey,
      signTransaction: wa.signTransaction ?? null,
      source: "wallet-adapter",
    };
  }

  return { publicKey: null, signTransaction: null, source: "none" };
}

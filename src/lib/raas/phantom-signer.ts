"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { usePhantom, useSolana } from "@phantom/react-sdk";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";

// Phantom Connect is gated by env. When NEXT_PUBLIC_PHANTOM_APP_ID is unset,
// PhantomConnectProvider in WalletProviders.tsx renders a no-op pass-through,
// which means usePhantom() / useSolana() would throw "must be used within
// PhantomProvider". Read the env constant once at module load — it never
// changes within a process, so the conditional hook calls below are stable
// across renders (Rules of Hooks compliant).
const PHANTOM_ENABLED = !!process.env.NEXT_PUBLIC_PHANTOM_APP_ID;

export interface UnifiedSigner {
  publicKey: PublicKey | null;
  signTransaction:
    | (<T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>)
    | null;
  /**
   * Sign an arbitrary message (for nonce-gated API actions).
   * Returns the raw signature bytes (64 bytes for Ed25519).
   *
   * Phantom Connect: `solana.signMessage(msg)` returns `{ signature: Uint8Array, publicKey: string }`.
   *   Actual shape per `ISolanaChain` in `@phantom/chain-interfaces`:
   *     signMessage(message: string | Uint8Array): Promise<{ signature: Uint8Array; publicKey: string }>
   *   We unwrap `.signature` to return raw bytes.
   *
   * Wallet adapter: `wa.signMessage(msg)` returns `Promise<Uint8Array>` directly.
   */
  signMessage: ((msg: Uint8Array) => Promise<Uint8Array>) | null;
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
 *   - `solana.signMessage` returns `Promise<{ signature: Uint8Array; publicKey: string }>`
 *     → unwrapped to return raw `Uint8Array` to match wallet-adapter's `signMessage`
 */
export function useUnifiedSigner(): UnifiedSigner {
  // Wallet-adapter path (always available)
  const wa = useWallet();

  // Phantom Connect path — only call its hooks when the provider is actually
  // mounted, otherwise they throw. PHANTOM_ENABLED is a build-time constant,
  // so this conditional is stable across renders.
  let phantomConnected = false;
  let solana: ReturnType<typeof useSolana>["solana"] | null = null;
  if (PHANTOM_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    phantomConnected = usePhantom().isConnected;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    solana = useSolana().solana;
  }

  if (phantomConnected && solana && solana.publicKey) {
    return {
      publicKey: new PublicKey(solana.publicKey),
      signTransaction: async <T extends Transaction | VersionedTransaction>(
        tx: T,
      ): Promise<T> => {
        const signed = await solana.signTransaction(tx);
        return signed as T;
      },
      // ISolanaChain.signMessage returns { signature: Uint8Array; publicKey: string }
      signMessage: async (msg: Uint8Array): Promise<Uint8Array> => {
        const result = await solana.signMessage(msg);
        return result.signature;
      },
      source: "phantom-connect",
    };
  }

  if (wa.connected && wa.publicKey) {
    return {
      publicKey: wa.publicKey,
      signTransaction: wa.signTransaction ?? null,
      // wallet-adapter signMessage returns Promise<Uint8Array> directly
      signMessage: wa.signMessage
        ? async (msg: Uint8Array): Promise<Uint8Array> => wa.signMessage!(msg)
        : null,
      source: "wallet-adapter",
    };
  }

  return { publicKey: null, signTransaction: null, signMessage: null, source: "none" };
}

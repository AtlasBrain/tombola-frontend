"use client";

import {
  PhantomProvider as RawPhantomProvider,
  darkTheme,
  type PhantomProviderProps,
} from "@phantom/react-sdk";
import { AddressType } from "@phantom/browser-sdk";
import type { ReactNode } from "react";

const APP_ID = process.env.NEXT_PUBLIC_PHANTOM_APP_ID ?? "";
export const PHANTOM_ENABLED = APP_ID.length > 0;

// Determine redirect URL at runtime (browser) or fall back to prod URL (SSR).
const REDIRECT_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/auth/phantom-callback`
    : "https://tombola.app/auth/phantom-callback";

/**
 * Wraps the tree with Phantom Connect's PhantomProvider.
 *
 * No-op pass-through when NEXT_PUBLIC_PHANTOM_APP_ID is unset — existing
 * wallet-adapter flow continues to work without any behaviour change.
 */
export function PhantomConnectProvider({ children }: { children: ReactNode }) {
  if (!PHANTOM_ENABLED) {
    // Not configured — pass through; existing wallet-adapter flow still works.
    return <>{children}</>;
  }

  const config: PhantomProviderProps["config"] = {
    providers: ["google", "apple", "phantom", "injected"],
    addressTypes: [AddressType.solana],
    authOptions: { redirectUrl: REDIRECT_URL },
    appId: APP_ID,
  };

  return (
    <RawPhantomProvider
      config={config}
      theme={darkTheme}
      appName="Tombola"
      appIcon="https://tombola.app/icon.png"
    >
      {children}
    </RawPhantomProvider>
  );
}

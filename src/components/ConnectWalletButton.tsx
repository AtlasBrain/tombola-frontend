"use client";

import dynamic from "next/dynamic";

/**
 * Thin wrapper around wallet-adapter's `WalletMultiButton`. Loaded with
 * `ssr: false` because the underlying button reads `window` and the
 * wallet-standard registry at mount — both browser-only. Without `ssr:
 * false`, Next.js' static render emits a hydration mismatch warning the
 * first time a connected user hits a page.
 *
 * Visual styling matches our Tailwind dark theme. Wallet-adapter ships
 * its own CSS (imported in WalletProviders.tsx); the inline `style` here
 * overrides only the dimensions / colour tokens that conflict with the
 * site's neutral-950/emerald palette. Anything we don't override falls
 * through to the library's defaults.
 */
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

export function ConnectWalletButton() {
  return (
    <WalletMultiButton
      style={{
        backgroundColor: "rgb(23 23 23)", // neutral-900
        color: "rgb(229 229 229)", // neutral-200
        borderRadius: "0.5rem",
        height: "2.5rem",
        fontSize: "0.875rem",
        fontFamily: "inherit",
        fontWeight: 500,
        padding: "0 1rem",
        border: "1px solid rgb(38 38 38)", // neutral-800
        lineHeight: "1.25rem",
      }}
    />
  );
}

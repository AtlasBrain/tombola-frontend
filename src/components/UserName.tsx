"use client";

// Resolves a wallet to its claimed pseudo for display, falling back to
// the short-form wallet address. Renders TEXT only — no link wrap —
// so it can drop into surfaces that already manage their own link or
// click target (e.g. WinnerBanner inside an explorer link, table cells
// inside their own anchor, etc.).
//
// For the link-wrapped variant, use <WalletLink /> instead.
//
// The pseudo lookup hits the session-wide pseudo-cache, so 30 rows
// referencing the same wallet share a single fetch.

import { usePseudo } from "@/lib/pseudo-cache";
import { shortAddress } from "@/lib/format";

interface Props {
  wallet: string;
  /** Optional className for the span. */
  className?: string;
  /** Optional inline style — used by call sites that need a specific
   *  accent (e.g. "you" highlight). */
  style?: React.CSSProperties;
  /** Override label entirely — when set, neither pseudo nor wallet
   *  are consulted. Useful for "anonymous" placeholders. */
  label?: string;
}

export function UserName({ wallet, className, style, label }: Props) {
  const pseudo = usePseudo(wallet);
  const text = label ?? pseudo ?? shortAddress(wallet);
  return (
    <span className={className} style={style} title={wallet}>
      {text}
    </span>
  );
}

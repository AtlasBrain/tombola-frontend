"use client";

import Link from "next/link";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { usePseudo } from "@/lib/pseudo-cache";
import { shortAddress } from "@/lib/format";

interface Props {
  wallet: string;
  /** The on-screen text. Defaults to a short `XXXX…YYYY` form of the wallet. */
  label?: string;
  /** Solana RPC URL. When provided, a small `↗` link to Solana Explorer is
   *  rendered next to the address. Omit it to hide the explorer link. */
  rpcUrl?: string;
  /** Tailwind/CSS class for the address text link. Inherit colour by default. */
  className?: string;
  /** Inline style for the address text — used by callers that want the
   *  "you" badge accent. */
  style?: React.CSSProperties;
  /** Optional content rendered to the right of the address — typically a
   *  badge such as "you" / "★ #14". */
  trailing?: React.ReactNode;
}

/**
 * Wallet address rendered as a clickable internal link to `/u/[wallet]`.
 * The Tombola profile page accepts either a wallet pubkey OR a pseudo, so
 * linking to the raw wallet always works — the page resolves and redirects
 * transparently when the wallet has claimed a pseudo.
 *
 * A small `↗` to Solana Explorer sits next to the address when an `rpcUrl`
 * is provided, so power users can still inspect the on-chain account.
 */
export function WalletLink({
  wallet,
  label,
  rpcUrl,
  className,
  style,
  trailing,
}: Props) {
  // Resolve the wallet → pseudo if one is set. Falls back to the truncated
  // wallet address otherwise. An explicit `label` prop always wins (used
  // when callers want a custom string, e.g. AdminRedemptionStatus).
  const pseudo = usePseudo(wallet);
  const displayLabel = label ?? pseudo ?? shortAddress(wallet);
  // When we render a pseudo, link to /u/<pseudo> for a prettier URL; the
  // page resolves either form to the same profile.
  const linkTarget = pseudo ?? wallet;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Link
        href={`/u/${encodeURIComponent(linkTarget)}`}
        title={`${wallet} — view profile`}
        className={`min-w-0 truncate transition-colors ${className ?? ""}`}
        style={style}
      >
        {displayLabel}
      </Link>
      {trailing}
      {rpcUrl && (
        <a
          href={explorerAddressUrl(wallet, rpcUrl)}
          target="_blank"
          rel="noreferrer"
          title="Open on Solana Explorer"
          aria-label={`${wallet} on Solana Explorer`}
          className="shrink-0 text-neutral-600 transition-colors hover:text-neutral-400"
          onClick={(e) => e.stopPropagation()}
        >
          ↗
        </a>
      )}
    </span>
  );
}

"use client";

import Link from "next/link";
import { explorerAddressUrl } from "@/lib/explorer-url";

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

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
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
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Link
        href={`/u/${encodeURIComponent(wallet)}`}
        title={`${wallet} — view profile`}
        className={`min-w-0 truncate transition-colors ${className ?? ""}`}
        style={style}
      >
        {label ?? shortAddress(wallet)}
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

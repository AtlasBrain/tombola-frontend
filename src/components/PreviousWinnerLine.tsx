"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { explorerTxUrl } from "@/lib/explorer-url";
import { WalletLink } from "@/components/WalletLink";
import { formatSol } from "@/lib/format";

interface Props {
  /** Pool PDA of the previous (resolved) round. */
  prevPoolAddress: string;
  /** Winner wallet address (base58). */
  winner: string;
  /** Total pot (lamports) — frozen at settle, used as the "amount won" label. */
  totalPotLamports: bigint;
  /** Slug + round, so the label can deep-link back to the resolved page. */
  poolTypeSlug: string;
  prevRound: bigint;
  /** Optional accent color for the wallet/tx links. */
  accent?: string;
}

/**
 * Renders a compact one-liner on an active (Open / AwaitingVrf) public pool
 * page that points to the previous resolved round's winner + settle tx.
 *
 * Settle signature is fetched client-side via `getSignaturesForAddress` on the
 * previous pool's PDA — after a pool is Resolved its most recent signature is
 * the settle tx that wrote `state = Resolved`. Cheap (one RPC call), so we
 * defer it to a useEffect instead of pre-fetching server-side.
 */
export function PreviousWinnerLine({
  prevPoolAddress,
  winner,
  totalPotLamports,
  poolTypeSlug,
  prevRound,
  accent = "#88cfc4",
}: Props) {
  const { connection } = useConnection();
  const [settleSig, setSettleSig] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sigs = await connection.getSignaturesForAddress(
          new PublicKey(prevPoolAddress),
          { limit: 1 },
        );
        if (cancelled) return;
        if (sigs.length > 0) setSettleSig(sigs[0].signature);
      } catch {
        // network blip — the line still works without the tx link
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, prevPoolAddress]);

  const rpcUrl = connection.rpcEndpoint;

  return (
    <div
      className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-3 font-mono text-xs"
      style={{ borderColor: `${accent}33` }}
    >
      <span
        className="uppercase tracking-widest text-[10px]"
        style={{ color: accent }}
      >
        Previous winner
      </span>
      <Link
        href={`/pool/${poolTypeSlug}/${prevRound.toString()}`}
        className="text-neutral-500 normal-case hover:text-neutral-300"
        title={`Round #${prevRound.toString()}`}
      >
        Round #{prevRound.toString()} →
      </Link>
      <WalletLink
        wallet={winner}
        rpcUrl={rpcUrl}
        className="text-neutral-200 hover:text-white"
      />
      <span className="text-neutral-500">
        won {formatSol(totalPotLamports)}
      </span>
      {settleSig && (
        <a
          href={explorerTxUrl(settleSig, rpcUrl)}
          target="_blank"
          rel="noreferrer"
          className="uppercase tracking-widest text-[10px] text-neutral-500 hover:text-neutral-300"
          title={settleSig}
        >
          settle tx ↗
        </a>
      )}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { hashLeaf, PROGRAM_ID, findRedeemedCodePda } from "@tombola/sdk";
import { encodeRedemptionLink } from "@/lib/private-pools";
import { loadCodesFromStorage, type StoredCodesPayload } from "@/lib/private-pool-storage";

interface Props {
  poolAddress: string;
  walletAddress: string;
}

interface RowState {
  code: string;
  proof: Uint8Array[];
  redeemed: boolean;
}

export function AdminRedemptionStatus({ poolAddress, walletAddress }: Props) {
  const { connection } = useConnection();
  const [stored, setStored] = useState<StoredCodesPayload | null | "missing">(
    null,
  );
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [showRedeemed, setShowRedeemed] = useState(false);

  // Load codes from localStorage
  useEffect(() => {
    const loaded = loadCodesFromStorage(poolAddress, walletAddress);
    setStored(loaded ?? "missing");
  }, [poolAddress, walletAddress]);

  // Check on-chain RedeemedCode PDA existence per code
  useEffect(() => {
    if (stored === null || stored === "missing") return;
    let cancelled = false;
    (async () => {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const checks = await Promise.all(
        stored.codes.map(async (code) => {
          const codeHash = hashLeaf(code);
          const [pda] = await findRedeemedCodePda(
            PROGRAM_ID as Address,
            poolAddress as Address,
            codeHash,
          );
          const acc = await rpc
            .getAccountInfo(pda as never, { encoding: "base64" })
            .send();
          return {
            code,
            proof: stored.proofs[code],
            redeemed: !!acc.value,
          } satisfies RowState;
        }),
      );
      if (!cancelled) setRows(checks);
    })();
    return () => {
      cancelled = true;
    };
  }, [stored, connection, poolAddress]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://tombola-frontend-gamma.vercel.app";

  const linkFor = useCallback(
    (row: RowState): string => {
      if (stored === null || stored === "missing") return "";
      return encodeRedemptionLink({
        origin,
        pool: poolAddress,
        code: row.code,
        proof: row.proof,
        mode: stored.mode,
      }).toString();
    },
    [stored, origin, poolAddress],
  );

  const onCopyOne = useCallback((url: string) => {
    void navigator.clipboard.writeText(url);
  }, []);

  const onCopyAllUnredeemed = useCallback(() => {
    if (!rows) return;
    const all = rows
      .filter((r) => !r.redeemed)
      .map(linkFor)
      .join("\n");
    void navigator.clipboard.writeText(all);
  }, [rows, linkFor]);

  const onDownloadCsv = useCallback(() => {
    if (!rows) return;
    const header = "index,code,redeemed,redemption_url\n";
    const body = rows
      .map(
        (r, i) =>
          `${i + 1},${r.code},${r.redeemed ? "yes" : "no"},${linkFor(r)}`,
      )
      .join("\n");
    const blob = new Blob([header + body], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tombola-codes-${poolAddress.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, linkFor, poolAddress]);

  if (stored === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Loading codes…
      </div>
    );
  }

  if (stored === "missing") {
    return (
      <div className="rounded-2xl border border-red-700/40 bg-red-900/20 p-6">
        <h3 className="font-display text-lg uppercase text-red-300">
          Codes not in this browser&apos;s storage
        </h3>
        <p className="mt-2 text-sm text-neutral-300">
          Invite codes are generated client-side at pool creation. If you
          didn&apos;t save them then (or you&apos;re on a different browser /
          device), they&apos;re unrecoverable.
        </p>
        <Link
          href={`/pool/private/${poolAddress}`}
          className="mt-4 inline-flex rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        >
          Open buyer view (reclaim rent if no tickets sold) →
        </Link>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Checking redemption status on chain…
      </div>
    );
  }

  const unredeemed = rows.filter((r) => !r.redeemed);
  const redeemed = rows.filter((r) => r.redeemed);
  const ratioPct = rows.length > 0 ? (redeemed.length / rows.length) * 100 : 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-500">
            Redemption status
          </h3>
          <p className="mt-1 text-2xl font-bold text-neutral-100">
            {redeemed.length} / {rows.length} redeemed{" "}
            <span className="text-sm font-normal text-neutral-500">
              ({ratioPct.toFixed(0)}%)
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopyAllUnredeemed}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            Copy all unredeemed
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${ratioPct}%` }}
        />
      </div>

      <h4 className="mt-6 mb-2 text-xs uppercase tracking-widest text-neutral-500">
        Unredeemed ({unredeemed.length})
      </h4>
      {unredeemed.length === 0 ? (
        <p className="text-sm text-neutral-500">All codes redeemed.</p>
      ) : (
        <ul className="max-h-[40vh] overflow-y-auto rounded border border-neutral-800 bg-neutral-950/40 p-2 font-mono text-xs">
          {unredeemed.map((r, i) => (
            <li
              key={r.code}
              className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-right text-neutral-600">
                {i + 1}
              </span>
              <code className="flex-1 truncate text-neutral-300">
                {r.code.slice(0, 16)}…
              </code>
              <button
                type="button"
                onClick={() => onCopyOne(linkFor(r))}
                aria-label={`Copy redemption link ${i + 1}`}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
              >
                Copy link
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowRedeemed((v) => !v)}
        className="mt-4 text-xs text-neutral-500 underline hover:text-neutral-300"
      >
        {showRedeemed ? "Hide" : "Show"} redeemed ({redeemed.length})
      </button>
      {showRedeemed && redeemed.length > 0 && (
        <ul className="mt-2 rounded border border-neutral-800 bg-neutral-950/40 p-2 font-mono text-xs">
          {redeemed.map((r, i) => (
            <li
              key={r.code}
              className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-right text-neutral-600">
                {i + 1}
              </span>
              <code className="flex-1 truncate text-neutral-500 line-through">
                {r.code.slice(0, 16)}…
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

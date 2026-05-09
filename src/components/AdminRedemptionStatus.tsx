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
  /** Pool state (0 Open, 1 AwaitingVrf, 2 Resolved). After close, unredeemed
   *  codes are voided on chain (close_time check in redeem_invite_code).
   *  Reflect that visually so the creator can't accidentally hand out dead links. */
  poolState: 0 | 1 | 2;
  /** Pool close_time in unix seconds. Used together with poolState to
   *  compute the "closed" predicate — Open + past-close also counts. */
  closeTimeUnix: number;
}

interface RowState {
  code: string;
  proof: Uint8Array[];
  redeemed: boolean;
}

const COPY_FEEDBACK_MS = 1_500;

export function AdminRedemptionStatus({
  poolAddress,
  walletAddress,
  poolState,
  closeTimeUnix,
}: Props) {
  const { connection } = useConnection();
  const [stored, setStored] = useState<StoredCodesPayload | null | "missing">(
    null,
  );
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [showRedeemed, setShowRedeemed] = useState(false);
  // copiedKey === code (per row) | "all" (bulk) | "csv" (download). Cleared
  // after COPY_FEEDBACK_MS so the user sees a transient confirmation.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isClosed =
    poolState !== 0 || closeTimeUnix * 1000 <= Date.now();

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

  const flashCopied = useCallback((key: string) => {
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, COPY_FEEDBACK_MS);
  }, []);

  const onCopyOne = useCallback(
    (url: string, key: string) => {
      void navigator.clipboard.writeText(url);
      flashCopied(key);
    },
    [flashCopied],
  );

  const onCopyAllUnredeemed = useCallback(() => {
    if (!rows) return;
    const all = rows
      .filter((r) => !r.redeemed)
      .map(linkFor)
      .join("\n");
    void navigator.clipboard.writeText(all);
    flashCopied("all");
  }, [rows, linkFor, flashCopied]);

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
    flashCopied("csv");
  }, [rows, linkFor, poolAddress, flashCopied]);

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
      {isClosed && (
        <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
            Pool closed
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            Unredeemed codes are <span className="font-semibold text-amber-200">voided</span>.
            The on-chain <code className="font-mono text-amber-200">redeem_invite_code</code>{" "}
            instruction rejects redemptions after <code>close_time</code>, so any link copied
            now would fail at simulation. Sharing them won&apos;t help your buyers.
          </p>
        </div>
      )}
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
            disabled={isClosed}
            className={`rounded px-3 py-1.5 text-xs transition ${
              isClosed
                ? "cursor-not-allowed bg-neutral-900 text-neutral-600"
                : copiedKey === "all"
                  ? "bg-emerald-600 text-white"
                  : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            }`}
          >
            {copiedKey === "all" ? "Copied ✓" : "Copy all unredeemed"}
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className={`rounded px-3 py-1.5 text-xs transition ${
              copiedKey === "csv"
                ? "bg-emerald-600 text-white"
                : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
            }`}
          >
            {copiedKey === "csv" ? "Downloaded ✓" : "Download CSV"}
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
          {unredeemed.map((r, i) => {
            const copied = copiedKey === r.code;
            return (
              <li
                key={r.code}
                className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
              >
                <span className="w-8 shrink-0 text-right text-neutral-600">
                  {i + 1}
                </span>
                <code
                  className={`flex-1 truncate ${
                    isClosed
                      ? "text-neutral-600 line-through"
                      : "text-neutral-300"
                  }`}
                >
                  {r.code.slice(0, 16)}…
                </code>
                {isClosed ? (
                  <span className="shrink-0 rounded bg-neutral-900 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                    Voided
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCopyOne(linkFor(r), r.code)}
                    aria-label={`Copy redemption link ${i + 1}`}
                    className={`shrink-0 rounded px-2 py-1 text-xs transition ${
                      copied
                        ? "scale-105 bg-emerald-600 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                        : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                    }`}
                  >
                    {copied ? "Copied ✓" : "Copy link"}
                  </button>
                )}
              </li>
            );
          })}
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

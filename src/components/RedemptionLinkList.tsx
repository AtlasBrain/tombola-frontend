"use client";
import { useCallback } from "react";
import { encodeRedemptionLink, type RedemptionMode } from "@/lib/private-pools";

interface Props {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: RedemptionMode;
}

export function RedemptionLinkList({
  poolAddress,
  codes,
  proofs,
  mode,
}: Props) {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://tombola-frontend-gamma.vercel.app";

  const links = codes.map((code) => ({
    code,
    url: encodeRedemptionLink({
      origin,
      pool: poolAddress,
      code,
      proof: proofs[code] ?? [],
      mode,
    }).toString(),
  }));

  const onCopyOne = useCallback((url: string) => {
    void navigator.clipboard.writeText(url);
  }, []);

  const onCopyAll = useCallback(() => {
    const all = links.map((l) => l.url).join("\n");
    void navigator.clipboard.writeText(all);
  }, [links]);

  const onDownloadCsv = useCallback(() => {
    const header = "index,code,redemption_url\n";
    const body = links
      .map((l, i) => `${i + 1},${l.code},${l.url}`)
      .join("\n");
    const blob = new Blob([header + body], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tombola-redemption-${poolAddress.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [links, poolAddress]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">
          {links.length} redemption link{links.length === 1 ? "" : "s"} ready.
          Save them now — they aren&apos;t shown again.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopyAll}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
          >
            Copy all
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
          >
            Download CSV
          </button>
        </div>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto rounded border border-neutral-800 bg-neutral-950/40 p-2 font-mono text-xs">
        {links.map((l, i) => (
          <li
            key={l.code}
            className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
          >
            <span className="w-8 shrink-0 text-right text-neutral-600">
              {i + 1}
            </span>
            <code className="flex-1 truncate text-neutral-300">{l.url}</code>
            <button
              type="button"
              onClick={() => onCopyOne(l.url)}
              aria-label={`Copy redemption link ${i + 1}`}
              className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
            >
              Copy
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

// src/app/r/_ops/revenue/page.tsx — Per-tenant lifetime protocol fees.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { TenantRevenueSummary } from "@/app/api/r/_ops/revenue/route";

export default function RevenuePageClient() {
  const signer = useUnifiedSigner();
  const [summaries, setSummaries] = useState<TenantRevenueSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signer.publicKey) return;
    setLoading(true);
    setError(null);
    fetch(`/api/r/_ops/revenue?operator_wallet=${signer.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then(
        (data: {
          tenants?: TenantRevenueSummary[];
          total_protocol_fees_lamports?: number;
          error?: string;
        }) => {
          if (data.error) setError(data.error);
          else {
            setSummaries(data.tenants ?? []);
            setTotal(data.total_protocol_fees_lamports ?? 0);
          }
        },
      )
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [signer.publicKey]);

  function lamportsToSol(l: number) {
    return (l / 1e9).toFixed(4);
  }

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Revenue</h1>
        <Link href="/r/_ops" className="text-sm opacity-60 hover:opacity-100">
          ← Back
        </Link>
      </div>

      {loading && <p className="opacity-60 text-sm">Aggregating…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && (
        <>
          <div className="border border-white/10 rounded-lg p-4 inline-block">
            <p className="text-xs opacity-60">Grand total protocol fees</p>
            <p className="text-3xl font-bold tabular-nums">
              {lamportsToSol(total)} SOL
            </p>
            <p className="text-xs opacity-40 mt-1">{total.toLocaleString()} lamports</p>
          </div>

          {summaries.length === 0 && (
            <p className="opacity-60 text-sm">
              No revenue data yet. Rollups are populated by the Phase F settle-event scan job.
            </p>
          )}

          {summaries.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-left opacity-60">
                  <th className="py-2 pr-4 font-normal">Slug</th>
                  <th className="py-2 pr-4 font-normal">Display name</th>
                  <th className="py-2 pr-4 font-normal text-right">Fees (SOL)</th>
                  <th className="py-2 font-normal text-right">Fees (lamports)</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr
                    key={s.slug}
                    className="border-b border-white/5 hover:bg-white/5 transition"
                  >
                    <td className="py-2 pr-4 font-mono">
                      <Link
                        href={`/r/_ops/tenants/${s.slug}`}
                        className="underline underline-offset-2 opacity-80 hover:opacity-100"
                      >
                        {s.slug}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{s.display_name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {lamportsToSol(s.lifetime_protocol_fees_lamports)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs opacity-60">
                      {s.lifetime_protocol_fees_lamports.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

"use client";

// src/app/r/_ops/tenants/page.tsx — Operator tenant list with status filter chips.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { Tenant, TenantStatus } from "@/types/raas";

const STATUSES: Array<TenantStatus | "all"> = ["all", "active", "suspended", "deleted"];

export default function OpsTenantListPage() {
  const signer = useUnifiedSigner();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filter, setFilter] = useState<TenantStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signer.publicKey) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      operator_wallet: signer.publicKey.toBase58(),
      ...(filter !== "all" ? { status: filter } : {}),
    });
    fetch(`/api/r/_ops/tenants?${qs}`)
      .then((r) => r.json())
      .then((data: { tenants?: Tenant[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setTenants(data.tenants ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [signer.publicKey, filter]);

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <Link href="/r/_ops" className="text-sm opacity-60 hover:opacity-100">
          ← Back
        </Link>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs border transition capitalize ${
              filter === s
                ? "border-white bg-white text-black"
                : "border-white/20 opacity-60 hover:opacity-100"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <p className="opacity-60 text-sm">Loading…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && tenants.length === 0 && (
        <p className="opacity-60 text-sm">No tenants found.</p>
      )}

      {tenants.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-left opacity-60">
              <th className="py-2 pr-4 font-normal">Slug</th>
              <th className="py-2 pr-4 font-normal">Display name</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 pr-4 font-normal">Owner wallet</th>
              <th className="py-2 font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr
                key={t.slug}
                className="border-b border-white/5 hover:bg-white/5 transition"
              >
                <td className="py-2 pr-4 font-mono">
                  <Link
                    href={`/r/_ops/tenants/${t.slug}`}
                    className="underline underline-offset-2 opacity-80 hover:opacity-100"
                  >
                    {t.slug}
                  </Link>
                </td>
                <td className="py-2 pr-4">{t.display_name}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={t.status} />
                </td>
                <td className="py-2 pr-4 font-mono text-xs opacity-60">
                  {t.owner_wallet.slice(0, 8)}…{t.owner_wallet.slice(-4)}
                </td>
                <td className="py-2 text-xs opacity-60">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: TenantStatus }) {
  const colors: Record<TenantStatus, string> = {
    active: "text-green-400",
    suspended: "text-yellow-400",
    deleted: "text-red-400",
  };
  return <span className={`capitalize ${colors[status]}`}>{status}</span>;
}

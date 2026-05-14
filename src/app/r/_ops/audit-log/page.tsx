"use client";

// src/app/r/_ops/audit-log/page.tsx — Browseable operator audit log table.
// Filters: action type + actor wallet. Pagination: prev/next buttons.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { AuditEntry } from "@/lib/raas/audit-log";

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const signer = useUnifiedSigner();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signer.publicKey) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      operator_wallet: signer.publicKey.toBase58(),
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(actorFilter ? { actor: actorFilter } : {}),
    });
    fetch(`/api/r/_ops/audit?${qs}`)
      .then((r) => r.json())
      .then((data: { entries?: AuditEntry[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setEntries(data.entries ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [signer.publicKey, offset, actionFilter, actorFilter]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
  }

  return (
    <main className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <Link href="/r/_ops" className="text-sm opacity-60 hover:opacity-100">
          ← Back
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs opacity-60 mb-1">Action</label>
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. suspend"
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-xs opacity-60 mb-1">Actor wallet</label>
          <input
            type="text"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="base58 pubkey"
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-56"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 border border-white/20 rounded text-sm hover:bg-white/5 transition"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={() => {
            setActionFilter("");
            setActorFilter("");
            setOffset(0);
          }}
          className="px-4 py-1.5 text-sm opacity-60 hover:opacity-100"
        >
          Clear
        </button>
      </form>

      {loading && <p className="opacity-60 text-sm">Loading…</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="opacity-60 text-sm">No entries found.</p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left opacity-60">
                <th className="py-2 pr-4 font-normal">Timestamp</th>
                <th className="py-2 pr-4 font-normal">Action</th>
                <th className="py-2 pr-4 font-normal">Target</th>
                <th className="py-2 pr-4 font-normal">Actor</th>
                <th className="py-2 font-normal">Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2 pr-4 text-xs opacity-60 whitespace-nowrap">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="bg-white/10 px-2 py-0.5 rounded text-xs">{e.action}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <Link
                      href={`/r/_ops/tenants/${e.target_slug}`}
                      className="underline underline-offset-2 opacity-80 hover:opacity-100"
                    >
                      {e.target_slug}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs opacity-60">
                    {e.actor_wallet.slice(0, 8)}…{e.actor_wallet.slice(-4)}
                  </td>
                  <td className="py-2 text-xs opacity-60">{e.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex gap-3 items-center">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          className="px-3 py-1.5 border border-white/20 rounded text-sm disabled:opacity-30 hover:bg-white/5 transition"
        >
          Previous
        </button>
        <span className="text-sm opacity-60">
          Showing {offset + 1}–{offset + entries.length}
        </span>
        <button
          disabled={entries.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          className="px-3 py-1.5 border border-white/20 rounded text-sm disabled:opacity-30 hover:bg-white/5 transition"
        >
          Next
        </button>
      </div>
    </main>
  );
}

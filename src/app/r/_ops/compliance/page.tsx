"use client";

// src/app/r/_ops/compliance/page.tsx — Compliance flags dashboard.
// Lists active flags, allows manual flagging and dismissal.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { ComplianceFlag } from "@/app/api/r/_ops/compliance/route";

export default function CompliancePage() {
  const signer = useUnifiedSigner();
  const [flags, setFlags] = useState<ComplianceFlag[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-flag form state
  const [addSlug, setAddSlug] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addStatus, setAddStatus] = useState<string | null>(null);

  function walletBase58() {
    return signer.publicKey?.toBase58() ?? "";
  }

  async function loadFlags() {
    if (!signer.publicKey) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      operator_wallet: walletBase58(),
      show_dismissed: showDismissed ? "1" : "0",
    });
    fetch(`/api/r/_ops/compliance?${qs}`)
      .then((r) => r.json())
      .then((data: { flags?: ComplianceFlag[]; error?: string }) => {
        if (data.error) setError(data.error);
        else setFlags(data.flags ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signer.publicKey, showDismissed]);

  async function handleAddFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!signer.publicKey) return;
    setAddStatus("Submitting…");
    try {
      const res = await fetch("/api/r/_ops/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator_wallet: walletBase58(),
          tenant_slug: addSlug,
          reason: addReason,
        }),
      });
      const data = (await res.json()) as { flag?: ComplianceFlag; error?: string };
      if (data.error) {
        setAddStatus(`Error: ${data.error}`);
      } else {
        setAddStatus("Flag added.");
        setAddSlug("");
        setAddReason("");
        await loadFlags();
      }
    } catch (e: unknown) {
      setAddStatus(`Error: ${String(e)}`);
    }
  }

  async function handleDismiss(flag_id: string) {
    if (!signer.publicKey) return;
    const res = await fetch("/api/r/_ops/compliance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operator_wallet: walletBase58(), flag_id }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (data.ok) await loadFlags();
    else setError(data.error ?? "dismiss failed");
  }

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compliance</h1>
        <Link href="/r/_ops" className="text-sm opacity-60 hover:opacity-100">
          ← Back
        </Link>
      </div>

      {/* Add flag form */}
      <section className="border border-white/10 rounded-lg p-4 space-y-4">
        <h2 className="font-semibold">Flag a tenant</h2>
        <form onSubmit={handleAddFlag} className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs opacity-60 mb-1">Tenant slug</label>
            <input
              type="text"
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              required
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-40"
              placeholder="e.g. mrbeast"
            />
          </div>
          <div>
            <label className="block text-xs opacity-60 mb-1">Reason</label>
            <input
              type="text"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              required
              className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm w-64"
              placeholder="e.g. Suspicious activity detected"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 border border-yellow-500 text-yellow-400 rounded text-sm hover:bg-yellow-500/10 transition"
          >
            Add flag
          </button>
        </form>
        {addStatus && <p className="text-sm opacity-60">{addStatus}</p>}
      </section>

      {/* Flags list */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">Active flags</h2>
          <label className="flex items-center gap-2 text-sm opacity-60 cursor-pointer">
            <input
              type="checkbox"
              checked={showDismissed}
              onChange={(e) => setShowDismissed(e.target.checked)}
              className="accent-current"
            />
            Show dismissed
          </label>
        </div>

        {loading && <p className="opacity-60 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && !error && flags.length === 0 && (
          <p className="opacity-60 text-sm">No flags found.</p>
        )}

        {flags.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left opacity-60">
                <th className="py-2 pr-4 font-normal">Tenant</th>
                <th className="py-2 pr-4 font-normal">Reason</th>
                <th className="py-2 pr-4 font-normal">Flagged by</th>
                <th className="py-2 pr-4 font-normal">Flagged at</th>
                <th className="py-2 font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr
                  key={f.flag_id}
                  className={`border-b border-white/5 hover:bg-white/5 transition ${
                    f.dismissed_at ? "opacity-40" : ""
                  }`}
                >
                  <td className="py-2 pr-4 font-mono">
                    <Link
                      href={`/r/_ops/tenants/${f.tenant_slug}`}
                      className="underline underline-offset-2"
                    >
                      {f.tenant_slug}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate" title={f.reason}>
                    {f.reason}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs opacity-60">
                    {f.flagged_by.slice(0, 8)}…{f.flagged_by.slice(-4)}
                  </td>
                  <td className="py-2 pr-4 text-xs opacity-60 whitespace-nowrap">
                    {new Date(f.flagged_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    {f.dismissed_at ? (
                      <span className="text-xs opacity-40">
                        Dismissed {new Date(f.dismissed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDismiss(f.flag_id)}
                        className="text-xs px-2 py-1 border border-white/20 rounded hover:bg-white/5 transition"
                      >
                        Dismiss
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

"use client";

// src/app/r/_ops/tenants/[slug]/page.tsx — Tenant detail with operator actions.
//
// Actions: Suspend, Reactivate, Revoke delegation, Override limits.
// Each action requires a signed nonce (ops_action context) from the operator wallet.
//
// GET also requires a signed nonce (read_tenant:{slug} context) matching the
// PATCH auth pattern — prevents unauthenticated reads of tenant detail.

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import type { Tenant, TenantLimits } from "@/types/raas";
import bs58 from "bs58";

export default function OpsTenantDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const signer = useUnifiedSigner();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Override-limits state
  const [showLimitsOverride, setShowLimitsOverride] = useState(false);
  const [maxPools, setMaxPools] = useState(50);
  const [maxMonthlyPot, setMaxMonthlyPot] = useState(1_000_000_000_000);

  useEffect(() => {
    if (!signer.publicKey || !signer.signMessage) return;
    const walletB58 = signer.publicKey.toBase58();
    setLoading(true);

    // GET requires a signed nonce matching the PATCH auth pattern.
    // 1. Issue nonce bound to read_tenant:{slug}.
    // 2. Sign tombola:read_tenant:{slug}:{nonce} with operator wallet.
    // 3. Pass wallet + nonce + signature as query params.
    const context = `read_tenant:${slug}`;
    fetch(`/api/r/signed-nonce?context=${encodeURIComponent(context)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("nonce_failed");
        const { nonce } = (await r.json()) as { nonce: string };
        const msg = new TextEncoder().encode(`tombola:${context}:${nonce}`);
        const sigRaw = await signer.signMessage!(msg);
        const signature = bs58.encode(sigRaw);
        return fetch(
          `/api/r/_ops/tenants/${slug}` +
            `?wallet=${encodeURIComponent(walletB58)}` +
            `&nonce=${encodeURIComponent(nonce)}` +
            `&signature=${encodeURIComponent(signature)}`,
        );
      })
      .then((r) => r.json())
      .then((data: { tenant?: Tenant; error?: string }) => {
        if (data.error) setError(data.error);
        else if (data.tenant) {
          setTenant(data.tenant);
          setMaxPools(data.tenant.limits.max_active_pools);
          setMaxMonthlyPot(data.tenant.limits.max_monthly_pot_lamports);
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [slug, signer.publicKey, signer.signMessage]);

  async function runAction(
    action: string,
    extraFields: Record<string, unknown> = {},
    reason = "",
  ) {
    if (!signer.publicKey || !signer.signMessage) {
      setActionStatus("Connect a wallet with signMessage support.");
      return;
    }
    setActionStatus("Requesting nonce…");
    try {
      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=ops_action`,
      );
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      setActionStatus("Waiting for wallet signature…");
      const msg = new TextEncoder().encode(`tombola:ops_action:${nonce}`);
      const sigRaw = await signer.signMessage(msg);
      const signature = bs58.encode(sigRaw);

      setActionStatus("Applying action…");
      const res = await fetch(`/api/r/_ops/tenants/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason,
          operator_wallet: signer.publicKey.toBase58(),
          signed_proof: { signature, nonce },
          ...extraFields,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; tenant?: Tenant; error?: string };
      if (data.ok && data.tenant) {
        setTenant(data.tenant);
        setActionStatus(`Done: ${action}`);
      } else {
        setActionStatus(`Error: ${data.error ?? "unknown"}`);
      }
    } catch (e: unknown) {
      setActionStatus(`Error: ${String(e)}`);
    }
  }

  if (!signer.publicKey) {
    return <main className="p-8"><p className="opacity-60">Connect a wallet.</p></main>;
  }
  if (loading) {
    return <main className="p-8"><p className="opacity-60">Loading…</p></main>;
  }
  if (error || !tenant) {
    return <main className="p-8"><p className="text-red-400">{error ?? "Tenant not found."}</p></main>;
  }

  return (
    <main className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tenant.display_name}</h1>
        <Link href="/r/_ops/tenants" className="text-sm opacity-60 hover:opacity-100">
          ← Tenants
        </Link>
      </div>

      {/* Meta */}
      <section className="border border-white/10 rounded-lg p-4 space-y-2 text-sm">
        <Row label="Slug" value={tenant.slug} mono />
        <Row label="Status" value={tenant.status} />
        <Row label="Owner wallet" value={tenant.owner_wallet} mono truncate />
        <Row label="Treasury wallet" value={tenant.treasury_wallet} mono truncate />
        <Row label="Contact email" value={tenant.contact_email} />
        <Row label="Created" value={new Date(tenant.created_at).toLocaleString()} />
        <Row label="Max active pools" value={String(tenant.limits.max_active_pools)} />
        <Row
          label="Max monthly pot (SOL)"
          value={String(tenant.limits.max_monthly_pot_lamports / 1e9)}
        />
        {tenant.delegated_signer && (
          <Row
            label="Delegated signer"
            value={`${tenant.delegated_signer.pubkey.slice(0, 12)}… (revoked: ${tenant.delegated_signer.revoked_at ?? "no"})`}
            mono
          />
        )}
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <h2 className="font-semibold">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {tenant.status === "active" && (
            <ActionButton
              label="Suspend"
              variant="danger"
              onClick={() => runAction("suspend", {}, "Operator suspension")}
            />
          )}
          {tenant.status === "suspended" && (
            <ActionButton
              label="Reactivate"
              variant="success"
              onClick={() => runAction("reactivate", {}, "Operator reactivation")}
            />
          )}
          {tenant.delegated_signer && !tenant.delegated_signer.revoked_at && (
            <ActionButton
              label="Revoke delegated key"
              variant="warning"
              onClick={() => runAction("revoke_delegation", {}, "Operator revoke")}
            />
          )}
          <ActionButton
            label="Override limits…"
            variant="neutral"
            onClick={() => setShowLimitsOverride((v) => !v)}
          />
        </div>

        {showLimitsOverride && (
          <div className="border border-white/10 rounded-lg p-4 space-y-3 text-sm">
            <h3 className="font-semibold">Override limits</h3>
            <label className="block">
              <span className="opacity-60 text-xs">Max active pools</span>
              <input
                type="number"
                value={maxPools}
                onChange={(e) => setMaxPools(Number(e.target.value))}
                className="block mt-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 w-full"
              />
            </label>
            <label className="block">
              <span className="opacity-60 text-xs">Max monthly pot (lamports)</span>
              <input
                type="number"
                value={maxMonthlyPot}
                onChange={(e) => setMaxMonthlyPot(Number(e.target.value))}
                className="block mt-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 w-full"
              />
            </label>
            <ActionButton
              label="Apply override"
              variant="warning"
              onClick={() =>
                runAction(
                  "override_limits",
                  {
                    limits: {
                      max_active_pools: maxPools,
                      max_monthly_pot_lamports: maxMonthlyPot,
                    } satisfies Partial<TenantLimits>,
                  },
                  "Operator limit override",
                )
              }
            />
          </div>
        )}
      </section>

      {actionStatus && (
        <p className="text-sm opacity-60">{actionStatus}</p>
      )}
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex gap-4 justify-between">
      <span className="opacity-60 shrink-0">{label}</span>
      <span className={`text-right ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: "danger" | "success" | "warning" | "neutral";
}) {
  const colors: Record<string, string> = {
    danger: "border-red-500 text-red-400 hover:bg-red-500/10",
    success: "border-green-500 text-green-400 hover:bg-green-500/10",
    warning: "border-yellow-500 text-yellow-400 hover:bg-yellow-500/10",
    neutral: "border-white/20 hover:bg-white/5",
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded border text-sm transition ${colors[variant]}`}
    >
      {label}
    </button>
  );
}

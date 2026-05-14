"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tenant } from "@/types/raas";
import { DelegatedKeySetup } from "./DelegatedKeySetup";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  tenant: Tenant;
}

export function AdminSettings({ tenant }: Props) {
  const router = useRouter();
  const signer = useUnifiedSigner();
  const [delegatedPubkey, setDelegatedPubkey] = useState<string | null>(
    tenant.delegated_signer?.pubkey ?? null,
  );
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Discord webhook state
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>(
    tenant.integrations?.discord_webhook_url ?? "",
  );
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  async function revokeKey() {
    if (!signer.publicKey || !signer.signMessage) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const bs58 = (await import("bs58")).default;
      const context = `revoke_delegated_key:${tenant.slug}`;

      // 1. Get a single-use nonce from the server.
      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=${encodeURIComponent(context)}`,
      );
      if (!nonceRes.ok) throw new Error("nonce_failed");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. Sign `tombola:{context}:{nonce}`.
      const msg = new TextEncoder().encode(`tombola:${context}:${nonce}`);
      const sigBytes = await signer.signMessage(msg);
      const signature = bs58.encode(sigBytes);

      // 3. DELETE with nonce + signature as query params.
      const res = await fetch(
        `/api/r/tenant/${tenant.slug}/delegated-key?nonce=${encodeURIComponent(nonce)}&signature=${encodeURIComponent(signature)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "revoke_failed");
      }
      setDelegatedPubkey(null);
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  }

  async function saveWebhook() {
    if (!signer.publicKey || !signer.signMessage) return;
    setSavingWebhook(true);
    setWebhookError(null);
    setWebhookSaved(false);
    try {
      const bs58 = (await import("bs58")).default;
      const context = `update_integrations:${tenant.slug}`;

      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=${encodeURIComponent(context)}`,
      );
      if (!nonceRes.ok) throw new Error("nonce_failed");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const msg = new TextEncoder().encode(`tombola:${context}:${nonce}`);
      const sigBytes = await signer.signMessage(msg);
      const signature = bs58.encode(sigBytes);

      const res = await fetch(`/api/r/tenant/${tenant.slug}/integrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_webhook_url: discordWebhookUrl || null,
          signed_proof: { nonce, signature },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "save_failed");
      }
      setWebhookSaved(true);
    } catch (e) {
      setWebhookError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingWebhook(false);
    }
  }

  async function deleteTenant() {
    if (!signer.publicKey) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/r/tenant/${tenant.slug}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_wallet: signer.publicKey.toBase58() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "delete_failed");
      }
      // Redirect to home after deletion
      router.push("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Branding section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Branding</h2>
        <p className="text-sm opacity-60">
          Re-run the brand wizard to update your logo, colors, and copy.
        </p>
        <a
          href={`/r/onboard?slug=${encodeURIComponent(tenant.slug)}`}
          className="inline-block px-4 py-2 rounded-md font-semibold text-black text-sm"
          style={{ background: tenant.branding.primary_color }}
        >
          Re-run brand wizard
        </a>
      </section>

      {/* Delegated key section */}
      <section className="space-y-3 border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold">Delegated hot key</h2>
        {delegatedPubkey ? (
          <div className="space-y-3">
            <p className="text-sm opacity-60">
              A hot key is active for automated raffle creation.
            </p>
            <div className="rounded-md border border-white/10 bg-neutral-900 p-3 font-mono text-sm break-all">
              {delegatedPubkey}
            </div>
            {revokeError && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-sm">
                {revokeError}
              </div>
            )}
            <button
              onClick={revokeKey}
              disabled={revoking || !signer.publicKey}
              className="px-4 py-2 rounded-md border border-red-500/50 text-red-300 text-sm hover:bg-red-500/10 transition disabled:opacity-40"
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </button>
          </div>
        ) : (
          <DelegatedKeySetup
            tenantSlug={tenant.slug}
            tenantPrimaryColor={tenant.branding.primary_color}
            onProvisioned={(pk) => setDelegatedPubkey(pk)}
          />
        )}
      </section>

      {/* Discord webhook section */}
      <section className="space-y-3 border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold">Discord webhook</h2>
        <p className="text-sm opacity-60">
          Paste a Discord Incoming Webhook URL to receive notifications when
          new pools are created and invite codes are assigned.
        </p>
        <input
          type="url"
          value={discordWebhookUrl}
          onChange={(e) => {
            setDiscordWebhookUrl(e.target.value);
            setWebhookSaved(false);
            setWebhookError(null);
          }}
          placeholder="https://discord.com/api/webhooks/…"
          className="w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm font-mono focus:outline-none focus:border-white/30"
        />
        {webhookError && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-sm">
            {webhookError}
          </div>
        )}
        {webhookSaved && (
          <div className="rounded-md bg-green-500/10 border border-green-500/30 p-2 text-green-200 text-sm">
            Webhook saved.
          </div>
        )}
        <button
          onClick={saveWebhook}
          disabled={savingWebhook || !signer.publicKey}
          className="px-4 py-2 rounded-md text-black text-sm font-semibold disabled:opacity-40 transition"
          style={{ background: tenant.branding.primary_color }}
        >
          {savingWebhook ? "Saving…" : "Save webhook"}
        </button>
      </section>

      {/* Danger zone */}
      <section className="space-y-3 border-t border-red-500/30 pt-6">
        <h2 className="text-lg font-semibold text-red-300">Danger zone</h2>
        <p className="text-sm opacity-60">
          Deleting your tenant is irreversible. All pool attributions and
          schedules will be orphaned. The slug cannot be reclaimed.
        </p>

        {deleteError && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-sm">
            {deleteError}
          </div>
        )}

        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="px-4 py-2 rounded-md border border-red-500/50 text-red-300 text-sm hover:bg-red-500/10 transition"
          >
            Delete tenant
          </button>
        ) : (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 space-y-3">
            <p className="text-sm text-red-200 font-semibold">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={deleteTenant}
                disabled={deleting || !signer.publicKey}
                className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border border-white/20 text-sm hover:border-white/40 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

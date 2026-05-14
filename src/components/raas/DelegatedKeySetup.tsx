"use client";

import { useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  tenantSlug: string;
  tenantPrimaryColor: string;
  onProvisioned: (delegatedPubkey: string) => void;
}

export function DelegatedKeySetup({
  tenantSlug,
  tenantPrimaryColor,
  onProvisioned,
}: Props) {
  const signer = useUnifiedSigner();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "fund" | "done">("idle");
  const [delegatedPubkey, setDelegatedPubkey] = useState<string | null>(null);

  async function provision() {
    if (!signer.publicKey || !signer.signMessage) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1. Generate keypair in-browser (never leaves browser in plaintext).
      const nacl = (await import("tweetnacl")).default;
      const bs58 = (await import("bs58")).default;
      const kp = nacl.sign.keyPair();
      const pubkeyB58 = bs58.encode(kp.publicKey);

      // 2. Sign wrap message with main wallet, authorizing the hot key.
      const wrapMsg = `tombola:delegate_key:${tenantSlug}:${pubkeyB58}`;
      const wrapSigBytes = await signer.signMessage(
        new TextEncoder().encode(wrapMsg),
      );
      const wrapSigB58 = bs58.encode(wrapSigBytes);

      // 3. Send encrypted private key + wrap signature to server.
      //    Server encrypts before persisting — plaintext never stored.
      const res = await fetch(
        `/api/r/tenant/${tenantSlug}/delegated-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delegated_pubkey: pubkeyB58,
            private_key_b64: Buffer.from(kp.secretKey).toString("base64"),
            wrap_signature: wrapSigB58,
            main_wallet: signer.publicKey.toBase58(),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "provision_failed");
      }

      setDelegatedPubkey(pubkeyB58);
      onProvisioned(pubkeyB58);
      setStep("fund");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done" && delegatedPubkey) {
    return (
      <div className="space-y-2">
        <p className="text-emerald-300 text-sm">Delegated key active</p>
        <p className="text-xs opacity-60 font-mono">
          {delegatedPubkey.slice(0, 16)}…
        </p>
      </div>
    );
  }

  if (step === "fund" && delegatedPubkey) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Fund the delegated key</h3>
        <p className="text-sm opacity-70">
          Send ~0.1 SOL to this address. The system uses it to pay network fees
          when auto-creating your scheduled raffles.
        </p>
        <div className="rounded-md border border-white/10 bg-neutral-900 p-3 font-mono text-sm break-all">
          {delegatedPubkey}
        </div>
        <button
          onClick={() => setStep("done")}
          className="px-4 py-2 rounded-md font-semibold text-black"
          style={{ background: tenantPrimaryColor }}
        >
          I&apos;ve funded it — finish
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Authorize automated raffle creation</h3>
      <p className="text-sm opacity-70">
        For recurring raffles, we need a key that can sign pool-creation
        transactions on your behalf. You&apos;ll authorize a fresh key
        (generated in your browser, never sent to us in plaintext) and fund it
        with a small amount of SOL for transaction fees. You can revoke this key
        at any time.
      </p>
      <p className="text-xs opacity-50">
        Risk: if the key leaks, an attacker could create raffles in your name
        (costing only network fees). Per-key rate-limited to 1 schedule firing
        per cadence interval. Revoke anytime from Settings.
      </p>
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-sm">
          {error}
        </div>
      )}
      <button
        onClick={provision}
        disabled={submitting || !signer.publicKey}
        className="px-4 py-2 rounded-md font-semibold text-black disabled:opacity-30"
        style={{ background: tenantPrimaryColor }}
      >
        {submitting ? "Setting up…" : "Authorize & generate key"}
      </button>
    </div>
  );
}

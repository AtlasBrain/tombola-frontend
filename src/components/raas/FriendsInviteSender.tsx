"use client";

// FriendsInviteSender — modal that wraps the v1 FriendPicker and lets the
// creator assign unredeemed invite codes to friends in one action.
//
// Prop interface is intentionally adapted to FriendPicker's ACTUAL API:
//   caller / value / onChange   (NOT ownerWallet / selected / onChange from plan sketch)
// The plan notes "Read FriendPicker.tsx first ... may need adjustment."
// FriendPicker also supports `maxSelected`, `disabledWallets`, and `compact`.
//
// After submission the API stores assignments in Redis and queues a
// per-wallet pending-invite record that the friend's client polls via
// useRaasInviteNotifications (Phase G hook). The creator gets an
// optimistic `onSent` callback so CodeManager can update local state.

import { useState } from "react";
import { FriendPicker } from "@/components/FriendPicker"; // v1, do NOT edit
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  tenantSlug: string;
  poolPubkey: string;
  /** Unredeemed code raw strings from CodeManager state. */
  availableCodes: string[];
  tenantPrimaryColor: string;
  onSent: (assignments: { friendWallet: string; code: string }[]) => void;
}

export function FriendsInviteSender({
  tenantSlug,
  poolPubkey,
  availableCodes,
  tenantPrimaryColor,
  onSent,
}: Props) {
  const signer = useUnifiedSigner();
  const [open, setOpen] = useState(false);
  // FriendPicker uses `value` (not `selected`) for lifted state.
  const [value, setValue] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendInvites() {
    if (!signer.publicKey || !signer.signMessage) {
      setError("Connect your wallet first.");
      return;
    }
    if (value.length === 0) {
      setError("Pick at least one friend.");
      return;
    }
    if (value.length > availableCodes.length) {
      setError(`Only ${availableCodes.length} unredeemed code${availableCodes.length === 1 ? "" : "s"} left.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Sign auth nonce so the server can verify the creator is the caller.
      const context = `assign_codes:${poolPubkey}`;
      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=${encodeURIComponent(context)}`,
      );
      if (!nonceRes.ok) throw new Error("Failed to get signing nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      const msg = `tombola:${context}:${nonce}`;
      const sigBytes = await signer.signMessage(new TextEncoder().encode(msg));
      const sigB58 = (await import("bs58")).default.encode(sigBytes);

      // Pair each selected friend with the next available code (FIFO).
      const assignments = value.map((friendWallet, i) => ({
        friend_wallet: friendWallet,
        code: availableCodes[i],
      }));

      const res = await fetch(`/api/r/pool/${poolPubkey}/assign-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          assignments,
          signed_proof: { signature: sigB58, nonce },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "assign_failed");
      }

      onSent(assignments.map((a) => ({ friendWallet: a.friend_wallet, code: a.code })));
      setOpen(false);
      setValue([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!signer.publicKey}
        className="px-4 py-2 rounded-md font-semibold text-black disabled:opacity-30"
        style={{ background: tenantPrimaryColor }}
      >
        Send invites to friends
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-md w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Send invites</h2>
          <button
            onClick={() => { setOpen(false); setValue([]); setError(null); }}
            className="opacity-60 hover:opacity-100 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* FriendPicker actual prop interface: caller / value / onChange / maxSelected */}
        <FriendPicker
          caller={signer.publicKey?.toBase58() ?? ""}
          value={value}
          onChange={setValue}
          maxSelected={availableCodes.length}
          compact
        />

        <p className="text-xs opacity-60">
          Selected: {value.length} · Available codes: {availableCodes.length}
        </p>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-xs">
            {error}
          </div>
        )}

        <button
          onClick={sendInvites}
          disabled={submitting || value.length === 0}
          className="w-full px-4 py-2 rounded-md font-semibold text-black disabled:opacity-30"
          style={{ background: tenantPrimaryColor }}
        >
          {submitting ? "Sending…" : `Send ${value.length} invite${value.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

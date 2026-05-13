"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripeOnramp } from "@stripe/crypto";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_ONRAMP_PUBLISHABLE_KEY ?? "";

export interface StripeOnrampDialogProps {
  open: boolean;
  walletAddress: string;
  amountUsd: number;
  cluster: "mainnet-beta" | "devnet";
  onComplete: () => void;
  onCancel: () => void;
  onError: (err: string) => void;
}

export function StripeOnrampDialog({
  open,
  walletAddress,
  amountUsd,
  cluster,
  onComplete,
  onCancel,
  onError,
}: StripeOnrampDialogProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!PUBLISHABLE_KEY) {
      onError("Stripe Onramp not configured (NEXT_PUBLIC_STRIPE_ONRAMP_PUBLISHABLE_KEY missing)");
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // 1) Get a session secret from our API.
        const res = await fetch("/api/r/stripe/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress, amountUsd, cluster }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? body.error ?? "session_create_failed");
        }
        const { session } = (await res.json()) as {
          session: { id: string; client_secret: string };
        };

        if (cancelled) return;

        // 2) Mount the Stripe Onramp UI.
        const stripeOnramp = await loadStripeOnramp(PUBLISHABLE_KEY);
        if (!stripeOnramp) throw new Error("Stripe Onramp SDK failed to load");

        const onramp = stripeOnramp.createSession({ clientSecret: session.client_secret });
        if (mountRef.current) {
          onramp.mount(mountRef.current);
          onramp.addEventListener("onramp_session_updated", (event) => {
            // Stripe's session status: 'initialized' | 'rejected' | 'requires_payment' | 'fulfillment_processing' | 'fulfillment_complete'
            const status = (event as unknown as { payload: { session: { status: string } } }).payload.session.status;
            if (status === "fulfillment_complete") {
              onComplete();
            } else if (status === "rejected") {
              onCancel();
            }
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) onError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [open, walletAddress, amountUsd, cluster, onComplete, onCancel, onError]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-neutral-900 rounded-xl border border-white/10 p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Pay with card</h3>
        {loading && <p className="text-sm opacity-60">Loading payment widget…</p>}
        <div ref={mountRef} className="min-h-[400px]" />
        <button
          onClick={onCancel}
          className="mt-4 text-sm opacity-70 hover:opacity-100 underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

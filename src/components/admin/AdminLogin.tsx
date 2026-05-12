"use client";

// Sign-to-enter screen rendered by AdminLayout when there's no valid
// session cookie. Three states:
//   - "signed-out": no cookie yet. Normal first visit.
//   - "revoked":    cookie was valid but the wallet has been removed
//                   from ADMIN_WALLETS since. Tell the user explicitly.
//
// Flow:
//   1. User connects wallet via the existing WalletProviders (already
//      mounted in the root layout — we just consume useWallet here).
//   2. We GET /api/admin/nonce/<wallet>, then signMessage on the canonical
//      `tombola:admin-session:<nonce>` payload.
//   3. POST /api/admin/session with the signature. On 200 the server
//      sets an httpOnly cookie; router.refresh() re-runs the layout
//      gate and we're in.
//
// All errors surface as inline messages — never a blank screen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { encodeBase58 } from "@/lib/base58";
import { CORAL, MINT } from "@/lib/colors";

interface Props {
  reason: "signed-out" | "revoked";
}

export function AdminLogin({ reason }: Props) {
  const { publicKey, signMessage, connected } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(
    reason === "revoked"
      ? "This wallet was removed from the admin allow-list. Sign in with a current admin wallet."
      : null,
  );

  async function signIn() {
    if (!publicKey || !signMessage) {
      setErr("Connect a wallet that supports signMessage (Phantom, Solflare).");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const wallet = publicKey.toBase58();
      // 1. Get a fresh nonce.
      const nonceRes = await fetch(`/api/admin/nonce/${wallet}`, {
        cache: "no-store",
      });
      if (!nonceRes.ok) {
        const j = await nonceRes.json().catch(() => null);
        throw new Error(j?.error ?? `Nonce fetch failed (${nonceRes.status}).`);
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. Sign the canonical message.
      const messageBytes = new TextEncoder().encode(
        `tombola:admin-session:${nonce}`,
      );
      const sig = await signMessage(messageBytes);

      // 3. POST signature for session cookie.
      const loginRes = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          nonce,
          signatureBase58: encodeBase58(sig),
        }),
      });
      if (!loginRes.ok) {
        const j = await loginRes.json().catch(() => null);
        throw new Error(
          j?.error ?? `Login rejected (${loginRes.status}).`,
        );
      }
      // 4. Re-run the layout gate.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <div
        className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-7 shadow-2xl shadow-black/60"
        style={{
          background:
            "linear-gradient(135deg, rgba(232,153,153,0.06), transparent 60%), #0a0a0a",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
            style={{ borderColor: `${CORAL}55`, color: CORAL }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: CORAL, boxShadow: `0 0 0 3px ${CORAL}33` }}
            />
            ADMIN ACCESS
          </span>
        </div>

        <h1 className="mt-3 font-display text-3xl uppercase tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Prove you control an authorized admin wallet. We&apos;ll ask your
          wallet to sign a short challenge — no transaction is sent and no
          fees are paid.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {/* WalletMultiButton renders "Connect Wallet" when disconnected,
              the wallet pill when connected. */}
          <WalletMultiButton style={{ width: "100%" }} />

          <button
            type="button"
            onClick={signIn}
            disabled={!connected || busy}
            style={{
              background: connected ? MINT : "#1a1a1a",
              color: connected ? "#000" : "#525252",
            }}
            className="rounded-full px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest transition hover:brightness-110 disabled:cursor-not-allowed"
          >
            {busy
              ? "Signing…"
              : connected
                ? "Sign challenge →"
                : "Connect wallet first"}
          </button>
        </div>

        {err && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-700/40 bg-rose-900/20 p-3 text-xs text-rose-300"
          >
            {err}
          </p>
        )}

        <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Sessions expire after 15 minutes · Nothing is logged outside this
          server
        </p>
      </div>
    </main>
  );
}

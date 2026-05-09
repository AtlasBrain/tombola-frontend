"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConnection } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { Header } from "@/components/Header";
import { RedeemButton } from "@/components/RedeemButton";
import {
  decodeRedemptionLink,
  type RedemptionLinkParams,
} from "@/lib/private-pools";

interface PoolGate {
  /** True when redeem_invite_code would reject (state != Open OR past close_time). */
  closed: boolean;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
}

function RedeemPageContent() {
  const sp = useSearchParams();
  const { connection } = useConnection();
  const [parsed, setParsed] = useState<
    | { ok: true; params: RedemptionLinkParams }
    | { ok: false; err: string }
    | null
  >(null);
  const [gate, setGate] = useState<PoolGate | null | "error">(null);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const params = decodeRedemptionLink(url);
      setParsed({ ok: true, params });
    } catch (e) {
      setParsed({
        ok: false,
        err: e instanceof Error ? e.message : "Invalid redemption link",
      });
    }
  }, [sp]);

  // Check pool state on chain. The on-chain handler enforces close_time + state
  // anyway, but doing the check here lets us show a friendly message instead
  // of "Simulation failed" after the user has already connected a wallet and
  // signed.
  useEffect(() => {
    if (parsed === null || !parsed.ok) return;
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        const acc = await fetchPrivatePool(rpc, parsed.params.pool as Address);
        if (cancelled) return;
        const closeTimeUnix = Number(acc.data.closeTime);
        const state = acc.data.state as 0 | 1 | 2;
        setGate({
          closed: state !== 0 || closeTimeUnix * 1000 <= Date.now(),
          closeTimeUnix,
          state,
        });
      } catch {
        if (!cancelled) setGate("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, parsed]);

  if (parsed === null) return null;

  if (!parsed.ok) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Invalid redemption link</h1>
        <p className="mt-4 text-sm text-neutral-400">{parsed.err}</p>
        <p className="mt-2 text-sm text-neutral-500">
          Ask the pool creator for a fresh link.
        </p>
      </main>
    );
  }

  if (gate && gate !== "error" && gate.closed) {
    const stateLabel =
      gate.state === 1
        ? "Drawing winner"
        : gate.state === 2
          ? "Resolved"
          : "Closed";
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
            This pool has closed · {stateLabel}
          </p>
          <h1 className="mt-1 font-display text-3xl uppercase">
            Code can&apos;t be redeemed
          </h1>
          <p className="mt-3 text-sm text-neutral-300">
            Redemption closed at{" "}
            {new Date(gate.closeTimeUnix * 1000).toLocaleString()}. The on-chain
            program rejects new redemptions after this point.
          </p>
        </div>
        <Link
          href={`/pool/private/${parsed.params.pool}`}
          className="mt-6 inline-flex rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        >
          See pool status →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-4xl uppercase">You&apos;re invited</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Pool:{" "}
        <code className="rounded bg-neutral-800 px-2 py-0.5 text-xs">
          {parsed.params.pool}
        </code>
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        Mode:{" "}
        {parsed.params.mode === "Whitelist"
          ? "Whitelist (one redemption, unlimited buys)"
          : "One ticket per code"}
      </p>
      <div className="mt-8">
        <RedeemButton params={parsed.params} />
      </div>
    </main>
  );
}

export default function RedeemPage() {
  return (
    <>
      <Header />
      <Suspense fallback={null}>
        <RedeemPageContent />
      </Suspense>
    </>
  );
}

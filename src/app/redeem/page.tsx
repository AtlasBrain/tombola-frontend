"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { RedeemButton } from "@/components/RedeemButton";
import {
  decodeRedemptionLink,
  type RedemptionLinkParams,
} from "@/lib/private-pools";

function RedeemPageContent() {
  const sp = useSearchParams();
  const [parsed, setParsed] = useState<
    | { ok: true; params: RedemptionLinkParams }
    | { ok: false; err: string }
    | null
  >(null);

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

"use client";

// src/components/raas/OperatorGate.tsx — Client gate for /r/_ops/* routes.
// States: disconnected → loading (null) → allowed → denied.

import { useEffect, useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

export function OperatorGate({ children }: { children: React.ReactNode }) {
  const signer = useUnifiedSigner();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!signer.publicKey) {
      setAllowed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/r/_ops/check?wallet=${signer.publicKey!.toBase58()}`,
      );
      const data = (await res.json()) as { allowed: boolean };
      if (!cancelled) setAllowed(data.allowed);
    })();
    return () => {
      cancelled = true;
    };
  }, [signer.publicKey]);

  if (!signer.publicKey) {
    return (
      <main className="p-8">
        <p className="opacity-60">Connect a wallet to continue.</p>
      </main>
    );
  }
  if (allowed === null) {
    return (
      <main className="p-8">
        <p className="opacity-60">Checking access…</p>
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="p-8">
        <p className="text-red-400">Not authorized.</p>
      </main>
    );
  }
  return <>{children}</>;
}

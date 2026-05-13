"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePhantom } from "@phantom/react-sdk";

/**
 * Handles the OAuth redirect back from Phantom Connect (Google/Apple login).
 * The Phantom React SDK resumes the auth round-trip automatically; this
 * component waits for the resulting connected state and redirects back to
 * wherever the buyer came from.
 *
 * Whitelist in Phantom Portal:
 *   https://tombola.app/auth/phantom-callback
 *   http://localhost:3000/auth/phantom-callback
 */
export function PhantomAuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const { isConnected } = usePhantom();

  useEffect(() => {
    if (isConnected) {
      const next = params.get("next") ?? "/";
      router.replace(next);
    }
  }, [isConnected, params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-neutral-400">Completing sign-in…</p>
    </div>
  );
}

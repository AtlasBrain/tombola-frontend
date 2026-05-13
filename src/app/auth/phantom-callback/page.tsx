import { Suspense } from "react";
import { PhantomAuthCallback } from "@/components/raas/PhantomAuthCallback";

/**
 * OAuth redirect landing page for Phantom Connect (Google/Apple login).
 * useSearchParams() inside PhantomAuthCallback requires a Suspense boundary
 * per Next.js 15 App Router rules.
 */
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Completing sign-in…</div>}>
      <PhantomAuthCallback />
    </Suspense>
  );
}

"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 text-xs uppercase tracking-wider text-rose-400">
        Something broke
      </p>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">
        We couldn&apos;t render this page.
      </h1>
      <p className="mb-6 text-sm text-neutral-400">
        Most likely the local validator dropped or an RPC call timed out.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs text-neutral-600">
            digest: {error.digest}
          </span>
        )}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
        >
          Retry
        </button>
        <Link
          href="/"
          className="rounded-lg border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

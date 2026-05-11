"use client";

// Session-level cache + dedupe for wallet→pseudo lookups.
//
// Without this, every <WalletLink wallet=…> in a list would fire its own
// /api/profile/[wallet] request on mount, even when many rows reference the
// same wallet (e.g. a "Recent buys" table where one buyer has bought 5
// times). The cache and the in-flight Map make sure each wallet hits the
// API at most once per session; the `usePseudo` hook subscribes components
// to the result.

import { useEffect, useState } from "react";

/** Resolved pseudos, or null when the lookup completed and there was no
 *  pseudo set. Lives for the tab lifetime — long enough for one nav session,
 *  short enough that stale data doesn't accumulate forever. */
const cache = new Map<string, string | null>();

/** In-flight fetches keyed by wallet, so concurrent callers share one
 *  promise instead of hammering the API. */
const inflight = new Map<string, Promise<string | null>>();

/** Bumped each time the cache mutates, so all `usePseudo` consumers can
 *  re-read in a single tick instead of each doing its own state dance. */
let revision = 0;
const subscribers = new Set<() => void>();
function notify() {
  revision++;
  for (const fn of subscribers) fn();
}

async function fetchPseudo(wallet: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(wallet)}`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { profile?: { pseudo?: string | null } };
    return j.profile?.pseudo ?? null;
  } catch {
    return null;
  }
}

function load(wallet: string): Promise<string | null> {
  if (cache.has(wallet)) return Promise.resolve(cache.get(wallet) ?? null);
  const existing = inflight.get(wallet);
  if (existing) return existing;
  const p = fetchPseudo(wallet).then((pseudo) => {
    cache.set(wallet, pseudo);
    inflight.delete(wallet);
    notify();
    return pseudo;
  });
  inflight.set(wallet, p);
  return p;
}

/**
 * Hook: returns the cached pseudo for `wallet`, or null while loading / when
 * not set. Re-renders when the cache updates for any wallet (cheap — just an
 * integer comparison). Caller decides what to do with null (typically falls
 * back to a shortened wallet address).
 */
export function usePseudo(wallet: string | null | undefined): string | null {
  const [, setRev] = useState(revision);
  useEffect(() => {
    const fn = () => setRev(revision);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  useEffect(() => {
    if (!wallet) return;
    if (!cache.has(wallet)) load(wallet);
  }, [wallet]);
  if (!wallet) return null;
  return cache.get(wallet) ?? null;
}

/** Imperative invalidate — call this after the user saves their own profile
 *  so their pseudo is read fresh everywhere on the page. */
export function invalidatePseudo(wallet: string): void {
  cache.delete(wallet);
  inflight.delete(wallet);
  notify();
}

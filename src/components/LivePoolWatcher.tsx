"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { address as toAddress, createSolanaRpcSubscriptions } from "@solana/kit";

interface Props {
  /** PublicPool PDAs to watch (one per visible pool). */
  addresses: string[];
  /** RPC URL — converted to ws:// for subscriptions. */
  rpcUrl: string;
  /** Debounce window. Multiple account-change notifications inside this window
   *  collapse to a single router.refresh() — keeps us from hammering the server
   *  when a buy_ticket tx mutates pool + ticket batch in the same slot. */
  debounceMs?: number;
  /** Optional client-side handler. Called (debounced) on every account-change
   *  notification, after the router.refresh kick. Needed by client-component
   *  pages whose state isn't a server component — router.refresh is a no-op
   *  for them, so they pass a callback that bumps a reload key. */
  onChange?: () => void;
}

/**
 * Solana convention: the WebSocket pubsub endpoint sits on (httpPort + 1) of the
 * same host. Validators expose 8899/HTTP + 8900/WS. Hosted RPCs (devnet,
 * mainnet-beta) use the same hostname with no explicit port — wss on 443 — so
 * the port-shift only applies when a port is in the URL.
 */
function httpToWs(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (url.port) url.port = String(Number(url.port) + 1);
  return url.toString();
}

export function LivePoolWatcher({
  addresses,
  rpcUrl,
  debounceMs = 300,
  onChange,
}: Props) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest onChange in a ref so the effect doesn't re-subscribe each
  // time the parent's render produces a new function identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (addresses.length === 0) return;
    const wsUrl = httpToWs(rpcUrl);
    const subs = createSolanaRpcSubscriptions(
      // Kit accepts a string when the cluster type isn't statically known —
      // localnet/devnet/mainnet helpers are stricter; we don't need them here.
      wsUrl as `ws://${string}` | `wss://${string}`,
    );
    const ac = new AbortController();

    function scheduleRefresh() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        onChangeRef.current?.();
      }, debounceMs);
    }

    // Open one subscription per address. Each notification triggers a
    // (debounced) router.refresh, which re-runs the server component's
    // getLivePools() and pushes fresh data into the React tree.
    for (const addr of addresses) {
      (async () => {
        try {
          const notifications = await subs
            .accountNotifications(toAddress(addr), { commitment: "confirmed" })
            .subscribe({ abortSignal: ac.signal });
          for await (const _notification of notifications) {
            if (ac.signal.aborted) return;
            scheduleRefresh();
          }
        } catch (e) {
          if (!ac.signal.aborted) {
            console.warn(`LivePoolWatcher: subscription failed for ${addr}:`, e);
          }
        }
      })();
    }

    return () => {
      ac.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [addresses, rpcUrl, debounceMs, router]);

  return null;
}

"use client";

// Polls /api/r/notifications/by-wallet/[wallet] and surfaces each pending
// RaaS notification as a toast via pushNotification(). Mirrors the v1
// usePoolInviteNotifications pattern but uses tenant_display as the title
// prefix so users see "MrBeast Raffles" not "Tombola".
//
// Mounted inside RaasNotificationListener, which is mounted in the RaaS
// tenant layout — notifications surface on every page of /r/[tenant]/…

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { pushNotification } from "@/lib/notifications";

interface RaasNotification {
  kind: "raas_invite" | "raas_recurring_fired" | string;
  tenant?: string;
  tenant_display?: string;
  pool?: string;
  pool_name?: string;
  url?: string;
  created_at?: string;
}

interface NotificationsResponse {
  notifications: RaasNotification[];
}

async function fetchRaasNotifications(wallet: string): Promise<RaasNotification[]> {
  const res = await fetch(`/api/r/notifications/by-wallet/${wallet}`);
  if (!res.ok) return [];
  const data = (await res.json()) as NotificationsResponse;
  return data.notifications ?? [];
}

export function useRaasInviteNotifications() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  // Track which notification created_at + pool pairs we already surfaced so
  // that a refetch within the same mount doesn't double-surface (the endpoint
  // clears on consume, but defensive guard is cheap).
  const seen = useRef<Set<string>>(new Set());

  const query = useQuery({
    enabled: !!wallet,
    queryKey: ["raasNotifications", "by-wallet", wallet],
    queryFn: () => fetchRaasNotifications(wallet!),
    // Poll every 60 s — same cadence as v1 pool-invite notifications.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!wallet || !query.data || query.data.length === 0) return;

    for (const notif of query.data) {
      const dedupeKey = `${notif.kind}-${notif.pool ?? ""}-${notif.created_at ?? ""}`;
      if (seen.current.has(dedupeKey)) continue;
      seen.current.add(dedupeKey);

      const tenantLabel = notif.tenant_display ?? "Tombola";

      if (notif.kind === "raas_invite") {
        pushNotification({
          wallet,
          kind: "invite",
          title: `${tenantLabel} — you have been invited`,
          body: "You received an invite code. Tap to claim your spot.",
          href: notif.url,
          dedupeId: `raas-invite-${notif.pool ?? ""}`,
        });
      } else if (notif.kind === "raas_recurring_fired") {
        pushNotification({
          wallet,
          kind: "info",
          title: `${tenantLabel} — new raffle launched`,
          body: notif.pool_name
            ? `${notif.pool_name} is now open.`
            : "A new scheduled raffle is open.",
          href: notif.pool
            ? `/r/${notif.tenant ?? ""}/pool/${notif.pool}`
            : undefined,
          dedupeId: `raas-fired-${notif.pool ?? ""}`,
        });
      } else {
        // Generic fallback for future raas_* kinds.
        pushNotification({
          wallet,
          kind: "info",
          title: `${tenantLabel}`,
          body: String(notif.kind),
          dedupeId: dedupeKey,
        });
      }
    }
  }, [wallet, query.data]);
}

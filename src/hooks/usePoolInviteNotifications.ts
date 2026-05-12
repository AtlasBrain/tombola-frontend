"use client";

// Polls /api/pool-invite/by-wallet/[wallet] and turns each pending
// invite into a persistent notification in the bell inbox. Dedup is
// handled by the notification system's dedupeId (one entry per
// (wallet, pool) pair).
//
// Mounted once at the layout level so notifications surface on every
// page, not only when the user happens to open the pool URL.

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { getInvitesForWallet } from "@/lib/pool-invite-client";
import { pushNotification } from "@/lib/notifications";

export function usePoolInviteNotifications() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const invitesQuery = useQuery({
    enabled: !!wallet,
    queryKey: ["poolInvites", "by-wallet", wallet],
    queryFn: () => getInvitesForWallet(wallet!),
    // Slow poll — invites are creator-driven so they don't arrive that
    // often. The pool-page banner does its own immediate fetch when
    // the recipient lands on the pool.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!wallet) return;
    if (!invitesQuery.data) return;
    for (const inv of invitesQuery.data) {
      if (inv.status !== "sent") continue;
      pushNotification({
        wallet,
        kind: "invite",
        title: "🎟 Friend invited you to a private pool",
        body: `${inv.inviter.slice(0, 6)}…${inv.inviter.slice(-4)} reserved a seat for you`,
        href: `/pool/private/${inv.pool}`,
        // One persistent notif per (wallet, pool) — re-pushing with the
        // same dedupeId is a no-op so this is safe to call on every
        // poll tick.
        dedupeId: `pool-invite-${inv.pool}`,
      });
    }
  }, [wallet, invitesQuery.data]);
}

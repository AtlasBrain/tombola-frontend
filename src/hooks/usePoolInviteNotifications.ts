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
import { displayNameFor } from "@/lib/pseudo-cache";

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
    let cancelled = false;
    (async () => {
      for (const inv of invitesQuery.data!) {
        if (inv.status !== "sent") continue;
        // Resolve the inviter's pseudo (cached after first hit) so the
        // notification body shows "marwan reserved a seat for you"
        // rather than a truncated wallet address. Falls back to
        // shortAddress when no pseudo is claimed.
        const inviterName = await displayNameFor(inv.inviter);
        if (cancelled) return;
        pushNotification({
          wallet,
          kind: "invite",
          title: `🎟 ${inviterName} invited you to a private pool`,
          body: `${inviterName} reserved a seat for you`,
          href: `/pool/private/${inv.pool}`,
          // One persistent notif per (wallet, pool) — re-pushing with the
          // same dedupeId is a no-op so this is safe to call on every
          // poll tick.
          dedupeId: `pool-invite-${inv.pool}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, invitesQuery.data]);
}

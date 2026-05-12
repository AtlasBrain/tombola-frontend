"use client";

// Polls the connected wallet's friend lists and pushes a persistent
// notification per incoming pending request. Dedupe is handled by the
// notification system's dedupeId (one entry per requester), so the
// poll loop never duplicates entries.
//
// Mounted once at the layout level via AppNotificationListeners so
// requests surface on every page — not only when the user is sitting
// on their profile.

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { getFriendLists } from "@/lib/friend-client";
import { pushNotification } from "@/lib/notifications";

export function useFriendRequestNotifications() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  // Reuse the same query key the ProfileCard's data hook uses with
  // viewer=null, so the friend-list cache is shared and the bell + the
  // profile page see the same set at the same time.
  const listsQuery = useQuery({
    enabled: !!wallet,
    queryKey: ["friends", wallet, null],
    queryFn: async () => {
      const lists = await getFriendLists(wallet!);
      return { relationship: null, lists };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!wallet) return;
    const lists = listsQuery.data?.lists;
    if (!lists) return;
    for (const requester of lists.pendingIn) {
      pushNotification({
        wallet,
        kind: "friend-request",
        title: "👤 New friend request",
        // The bell renders bodies as plain text, so we can't embed a
        // <UserName> here. Showing the short address is fine — the
        // notification click takes the user to the requester's profile
        // where the pseudo (if any) renders.
        body: `${requester.slice(0, 6)}…${requester.slice(-4)} wants to connect`,
        href: `/u/${requester}`,
        // One persistent notif per requester. Re-pushing is a no-op so
        // the poll loop is idempotent.
        dedupeId: `friend-request-${requester}`,
      });
    }
  }, [wallet, listsQuery.data]);
}

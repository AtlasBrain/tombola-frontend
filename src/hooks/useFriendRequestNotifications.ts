"use client";

// Polls the connected wallet's friend lists and pushes persistent
// notifications for two transitions:
//
//   1. Someone APPEARED in `pendingIn` since the last poll
//      → "👤 New friend request" — they want to connect with you
//
//   2. Someone moved from `pendingOut` → `friends` since the last poll
//      → "✓ X accepted your friend request" — your outbound was accepted
//
// Transition #2 needs a previous snapshot, kept in localStorage per
// wallet. First poll for a wallet seeds the snapshot WITHOUT firing
// notifications (otherwise every existing friend would notify on first
// page load).
//
// Dedup is belt-and-suspenders: localStorage ensures we only diff vs
// last poll, AND each notification carries a dedupeId so the bell
// itself drops duplicates across browser restarts.
//
// Mounted once at the layout level via AppNotificationListeners so
// requests surface on every page — not only when the user is sitting
// on their profile.

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import {
  getFriendLists,
  type FriendListsResponse,
} from "@/lib/friend-client";
import { pushNotification } from "@/lib/notifications";
import { displayNameFor } from "@/lib/pseudo-cache";

interface Snapshot {
  friends: string[];
  pendingIn: string[];
  pendingOut: string[];
}

function snapshotKey(wallet: string): string {
  return `tombola.friendSnapshot.${wallet}`;
}

function readSnapshot(wallet: string): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(snapshotKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    // Defensive shape check — corrupted entry gets treated as no snapshot.
    if (
      !parsed ||
      !Array.isArray(parsed.friends) ||
      !Array.isArray(parsed.pendingIn) ||
      !Array.isArray(parsed.pendingOut)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(wallet: string, snap: Snapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(snapshotKey(wallet), JSON.stringify(snap));
  } catch {
    // Quota / private mode — fall through; the next poll just doesn't
    // diff. Worst case the user re-sees a notification they already
    // dismissed.
  }
}

function toSnapshot(lists: FriendListsResponse): Snapshot {
  return {
    friends: lists.friends,
    pendingIn: lists.pendingIn,
    pendingOut: lists.pendingOut,
  };
}

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
    const prev = readSnapshot(wallet);
    let cancelled = false;

    (async () => {
      // Incoming requests — fire one persistent notif per requester.
      // dedupeId keeps the bell from duplicating across restarts; the
      // poll loop is idempotent. Pseudo is resolved (and cached) before
      // the body string is built so the notification reads
      // "marwan wants to connect" instead of a truncated wallet.
      for (const requester of lists.pendingIn) {
        const name = await displayNameFor(requester);
        if (cancelled) return;
        pushNotification({
          wallet,
          kind: "friend-request",
          title: "👤 New friend request",
          body: `${name} wants to connect`,
          href: `/u/${requester}`,
          dedupeId: `friend-request-${requester}`,
        });
      }

      // Accepted-by transition — only fire when we have a previous
      // snapshot. First poll for a wallet seeds the snapshot without
      // notifying, otherwise every long-standing friend would notify.
      if (prev) {
        const prevPendingOut = new Set(prev.pendingOut);
        const prevFriends = new Set(prev.friends);
        for (const friend of lists.friends) {
          if (prevFriends.has(friend)) continue; // already a friend last poll
          if (!prevPendingOut.has(friend)) continue; // didn't originate from MY request
          const name = await displayNameFor(friend);
          if (cancelled) return;
          pushNotification({
            wallet,
            kind: "friend-request",
            title: "✓ Friend request accepted",
            body: `${name} accepted your request`,
            href: `/u/${friend}`,
            dedupeId: `friend-accepted-${friend}`,
          });
        }
      }

      if (!cancelled) writeSnapshot(wallet, toSnapshot(lists));
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, listsQuery.data]);
}

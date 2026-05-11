"use client";

// Single hook that bundles the three independent data fetches a ProfileCard
// needs: friendship/lists, on-chain stats, weekly activity. Each fetch is
// kicked off independently (none blocks the others) and returns its own
// slice of state so the UI can render partial data while the rest loads.
//
// `refresh()` bumps an internal tick that retriggers the friendship lookup
// only — stats / activity already refetch on wallet change and are cheap
// enough to leave alone after a friend action.

import { useCallback, useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";
import { PROGRAM_ID } from "@tombola/sdk";
import {
  getFriendLists,
  getFriendState,
  type Relationship,
} from "@/lib/friend-client";
import { fetchWalletStats, type WalletStats } from "@/lib/wallet-stats";
import {
  fetchWalletActivity,
  type WeeklyActivity,
} from "@/lib/wallet-activity";

export interface ProfileData {
  /** Friendship between viewer and profile owner. null = first lookup pending. */
  relationship: Relationship | null;
  /** Accepted friend count of the PROFILE wallet (not the viewer's). */
  friendCount: number | null;
  /** Pending-in count — only populated when viewer is the owner. */
  pendingIn: number;
  /** On-chain lifetime stats. null until first fetch resolves. */
  stats: WalletStats | null;
  /** 14-week buy activity sparkbar source. null until first fetch resolves. */
  activity: WeeklyActivity | null;
  /** Force a friendship refetch — call after a successful mutation. */
  refresh: () => void;
}

export function useProfileData(args: {
  wallet: string;
  viewer: string | null;
  isOwner: boolean;
  connection: Connection;
}): ProfileData {
  const { wallet, viewer, isOwner, connection } = args;

  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [pendingIn, setPendingIn] = useState<number>(0);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [activity, setActivity] = useState<WeeklyActivity | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Friendship lookup. Refetches on viewer change or after a mutation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rel, lists] = await Promise.all([
          viewer
            ? getFriendState(viewer, wallet)
            : Promise.resolve<Relationship>("strangers"),
          getFriendLists(wallet),
        ]);
        if (cancelled) return;
        setRelationship(rel);
        setFriendCount(lists.count);
        if (isOwner) setPendingIn(lists.pendingIn.length);
      } catch {
        // Network blip — keep last-known state visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, wallet, isOwner, refreshTick]);

  // On-chain stats. Refetches on profile wallet change.
  useEffect(() => {
    let cancelled = false;
    setStats(null);
    (async () => {
      try {
        const s = await fetchWalletStats({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          wallet,
        });
        if (!cancelled) setStats(s);
      } catch {
        // RPC blip — leave null so the UI's dashes stay visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet]);

  // Weekly activity (sparkbar). Separate effect because it does N
  // getSignaturesForAddress calls and we don't want it to block the
  // headline numbers above.
  useEffect(() => {
    let cancelled = false;
    setActivity(null);
    (async () => {
      try {
        const a = await fetchWalletActivity({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          wallet,
        });
        if (!cancelled) setActivity(a);
      } catch {
        // Leave null; the bar grid stays in its muted "pending" state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet]);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  return { relationship, friendCount, pendingIn, stats, activity, refresh };
}

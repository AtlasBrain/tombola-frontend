"use client";

// Bundles the three independent data fetches a ProfileCard needs:
// friendship/lists, on-chain wallet stats, weekly activity. Each one is
// its own react-query query keyed by wallet (and viewer where relevant)
// so cache + dedup come for free — two ProfileCards (or a ProfileCard
// plus a sibling stats consumer) share results.
//
// `refresh()` invalidates the friendship query so the UI reflects a
// just-completed friend action without waiting for staleTime to expire.

import { useCallback } from "react";
import type { Connection } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** Accepted friend count of the PROFILE wallet. */
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
  const qc = useQueryClient();

  // Friendship + lists. Viewer-included key so two viewers looking at the
  // same profile don't see each other's relationship.
  const friendsQuery = useQuery({
    queryKey: ["friends", wallet, viewer],
    queryFn: async () => {
      const [rel, lists] = await Promise.all([
        viewer
          ? getFriendState(viewer, wallet)
          : Promise.resolve<Relationship>("strangers"),
        getFriendLists(wallet),
      ]);
      return { relationship: rel, lists };
    },
  });

  const walletStatsQuery = useQuery({
    queryKey: ["walletStats", wallet, connection.rpcEndpoint],
    queryFn: () =>
      fetchWalletStats({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        wallet,
      }),
  });

  // 14-week buy activity. Heavier query (N signatures) — longer staleTime
  // so navigating between tabs doesn't refetch.
  const activityQuery = useQuery({
    queryKey: ["walletActivity", wallet, connection.rpcEndpoint],
    queryFn: () =>
      fetchWalletActivity({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        wallet,
      }),
    staleTime: 5 * 60_000,
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["friends", wallet] });
  }, [qc, wallet]);

  return {
    relationship: friendsQuery.data?.relationship ?? null,
    friendCount: friendsQuery.data?.lists.count ?? null,
    pendingIn:
      isOwner && friendsQuery.data
        ? friendsQuery.data.lists.pendingIn.length
        : 0,
    stats: walletStatsQuery.data ?? null,
    activity: activityQuery.data ?? null,
    refresh,
  };
}

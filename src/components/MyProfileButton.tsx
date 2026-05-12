"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { fetchProfile, type ProfileRow } from "@/lib/profile-client";
import { getFriendLists } from "@/lib/friend-client";

/**
 * Header button that replaces the old "DEVNET" pill. When the wallet is
 * connected, links to /u/[pseudo-or-wallet] and shows the user's avatar +
 * pseudo. When not connected, renders nothing (the ConnectWalletButton
 * already covers that case).
 */
interface Props {
  /** When true, render at full mobile width (used inside the mobile
   *  drawer). Default false renders the compact desktop pill. */
  mobile?: boolean;
}

export function MyProfileButton({ mobile = false }: Props = {}) {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  // Reuse the same ["friends", wallet, null] cache key the bell + the
  // profile page already populate so this is essentially free.
  const wallet0 = publicKey?.toBase58() ?? null;
  const friendsQuery = useQuery({
    enabled: !!wallet0,
    queryKey: ["friends", wallet0, null],
    queryFn: async () => {
      const lists = await getFriendLists(wallet0!);
      return { relationship: null, lists };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const pendingIn = friendsQuery.data?.lists.pendingIn.length ?? 0;

  // Fetch the connected wallet's profile to know its current pseudo +
  // avatar. Refetch when the wallet changes. Lightweight cache: just one
  // row per session.
  useEffect(() => {
    if (!publicKey) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchProfile(publicKey.toBase58());
        if (!cancelled) setProfile(row);
      } catch {
        // Network blip — keep last value. The button still works against
        // the raw wallet address.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  if (!publicKey) return null;

  const wallet = publicKey.toBase58();
  const handle = profile?.pseudo ?? wallet;
  const label = profile?.pseudo ?? `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  const imageUrl =
    profile?.avatar?.kind === "upload" ? profile.avatar.url : null;
  const initial = (profile?.pseudo?.charAt(0) ?? wallet.charAt(0) ?? "?")
    .toUpperCase();

  return (
    <Link
      href={`/u/${encodeURIComponent(handle)}`}
      title={
        pendingIn > 0
          ? `My profile — ${pendingIn} pending friend request${pendingIn === 1 ? "" : "s"}`
          : "My profile"
      }
      className={
        mobile
          ? "relative flex h-12 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-mono text-xs uppercase tracking-widest text-neutral-200 transition hover:border-neutral-600"
          : "relative hidden items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100 sm:inline-flex"
      }
    >
      <span className="relative inline-block">
        <WalletIdenticon
          wallet={wallet}
          size={mobile ? 28 : 20}
          imageUrl={imageUrl}
          initialOverride={initial}
        />
        {/* Pending-friend-request badge — small mint dot for ≤ 1,
            numeric counter for 2+. Position over the avatar's
            top-right corner. */}
        {pendingIn > 0 && (
          <span
            aria-label={`${pendingIn} pending friend request${pendingIn === 1 ? "" : "s"}`}
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:#88cfc4] px-1 font-mono text-[9px] font-bold text-black"
          >
            {pendingIn}
          </span>
        )}
      </span>
      <span className={mobile ? "truncate" : "max-w-[120px] truncate"}>
        {label}
      </span>
    </Link>
  );
}

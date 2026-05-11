"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { fetchProfile, type ProfileRow } from "@/lib/profile-client";

/**
 * Header button that replaces the old "DEVNET" pill. When the wallet is
 * connected, links to /u/[pseudo-or-wallet] and shows the user's avatar +
 * pseudo. When not connected, renders nothing (the ConnectWalletButton
 * already covers that case).
 */
export function MyProfileButton() {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

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
      title="My profile"
      className="hidden items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100 sm:inline-flex"
    >
      <WalletIdenticon
        wallet={wallet}
        size={20}
        imageUrl={imageUrl}
        initialOverride={initial}
      />
      <span className="max-w-[120px] truncate">{label}</span>
    </Link>
  );
}

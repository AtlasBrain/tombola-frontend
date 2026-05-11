"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { Header } from "@/components/Header";
import { ProfileCard } from "@/components/ProfileCard";
import { fetchProfile, type ProfileRow } from "@/lib/profile-client";

interface PageProps {
  params: Promise<{ handle: string }>;
}

/**
 * Public profile page at /u/[handle].
 *
 * `handle` is either a base58 wallet pubkey OR a claimed pseudo (case-
 * insensitive). The API route disambiguates and returns a ProfileRow with
 * the public view applied (private profiles are stripped of stats etc.).
 */
export default function ProfilePage({ params }: PageProps) {
  const { handle } = use(params);
  const { connection } = useConnection();
  const [profile, setProfile] = useState<ProfileRow | null | "missing">(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchProfile(handle);
        if (cancelled) return;
        setProfile(row ?? "missing");
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-6">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest text-neutral-500 transition hover:text-neutral-300"
          >
            ← All pools
          </Link>
        </div>

        {err && (
          <div className="rounded-2xl border border-rose-700/40 bg-rose-900/20 p-6">
            <h1 className="font-display text-2xl uppercase">Profile error</h1>
            <p className="mt-2 text-sm text-neutral-400">{err}</p>
          </div>
        )}

        {!err && profile === null && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
            Loading profile…
          </div>
        )}

        {!err && profile === "missing" && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
            <h1 className="font-display text-2xl uppercase">Profile not found</h1>
            <p className="mt-2 text-sm text-neutral-400">
              No wallet has claimed the pseudo &ldquo;{handle}&rdquo;.
            </p>
          </div>
        )}

        {!err && profile && profile !== "missing" && (
          <ProfileCard
            profile={profile}
            rpcUrl={connection.rpcEndpoint}
            onProfileUpdated={(next) => setProfile(next)}
          />
        )}
      </main>
    </>
  );
}

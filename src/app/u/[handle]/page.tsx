"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useConnection } from "@solana/wallet-adapter-react";
import { Header } from "@/components/Header";
import { ProfileCard } from "@/components/ProfileCard";
import { CreatorPanel } from "@/components/CreatorPanel";
import { fetchProfile, type ProfileRow } from "@/lib/profile-client";

interface PageProps {
  params: Promise<{ handle: string }>;
}

type Tab = "overview" | "creator";

/**
 * Public profile page at /u/[handle].
 *
 * `handle` is either a base58 wallet pubkey OR a claimed pseudo (case-
 * insensitive). The API route disambiguates and returns a ProfileRow with
 * the public view applied (private profiles are stripped of stats etc.).
 *
 * Tabs:
 *   ?tab=overview (default) — ProfileCard: identity, stats, friends.
 *   ?tab=creator            — CreatorPanel: pools this wallet has created.
 *
 * The legacy /creator/[address] route redirects here with tab=creator.
 */
export default function ProfilePage({ params }: PageProps) {
  const { handle } = use(params);
  const { connection } = useConnection();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [profile, setProfile] = useState<ProfileRow | null | "missing">(null);
  const [err, setErr] = useState<string | null>(null);

  const tab: Tab = search.get("tab") === "creator" ? "creator" : "overview";

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

  function setTab(next: Tab) {
    const params = new URLSearchParams(search.toString());
    if (next === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

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
          <>
            {/* Profile card always visible — it's the identity layer.
                The tab bar below switches the lower content area. */}
            <ProfileCard
              profile={profile}
              rpcUrl={connection.rpcEndpoint}
              onProfileUpdated={(next) => setProfile(next)}
            />

            <div
              className="mt-6 flex w-fit gap-1 rounded-full border p-1"
              style={{
                borderColor: "rgba(136,207,196,0.33)",
                background: "rgba(0,0,0,0.4)",
              }}
              role="tablist"
              aria-label="Profile sections"
            >
              <TabBtn
                active={tab === "overview"}
                onClick={() => setTab("overview")}
              >
                Overview
              </TabBtn>
              <TabBtn
                active={tab === "creator"}
                onClick={() => setTab("creator")}
              >
                Pools created
              </TabBtn>
            </div>

            {tab === "creator" && <CreatorPanel address={profile.wallet} />}
            {/* Overview tab body is just the ProfileCard above — nothing
                more to render here. Keeping the tab bar visible on
                Overview makes the "Pools created" tab discoverable. */}
          </>
        )}
      </main>
    </>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={
        active
          ? { background: "#88cfc4", color: "#000" }
          : { color: "#a3a3a3" }
      }
      className="rounded-full px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition"
    >
      {children}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PROGRAM_ID } from "@tombola/sdk";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { EditProfileModal } from "@/components/EditProfileModal";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, shortAddress} from "@/lib/format";
import type { ProfileRow } from "@/lib/profile-client";
import { fetchWalletStats, type WalletStats } from "@/lib/wallet-stats";
import {
  fetchWalletActivity,
  type WeeklyActivity,
} from "@/lib/wallet-activity";
import {
  getFriendLists,
  getFriendState,
  sendFriendAction,
  type Relationship,
} from "@/lib/friend-client";
import { useToast } from "@/components/Toast";

interface Props {
  profile: ProfileRow;
  rpcUrl: string;
  /** Replaces this row when the user saves their edits — wired to `setState`
   *  in the parent page. */
  onProfileUpdated?: (next: ProfileRow) => void;
}

const MINT = "#88cfc4";

/**
 * Option B layout: avatar (72px) + pseudo + rank + wallet + X + friends
 * count on a stacked left column, Net PnL hero + Add-friend button stacked
 * on the right.
 *
 * Public vs private rendering — when the profile is private AND the viewer
 * isn't the owner, the bottom panels (stats / sparkbar / badges) are
 * replaced with a "this profile is private" hint. The header (pseudo,
 * avatar, wallet, friend button) stays so the relationship can still be
 * initiated.
 */
export function ProfileCard({ profile, rpcUrl, onProfileUpdated }: Props) {
  const { connection } = useConnection();
  const { publicKey, signMessage } = useWallet();
  const { push: pushToast } = useToast();
  const viewer = publicKey?.toBase58() ?? null;
  const isOwner = viewer !== null && viewer === profile.wallet;
  const [editOpen, setEditOpen] = useState(false);

  // Friendship state — null until first /api/friends/state lookup resolves.
  // Refreshed whenever the viewer or target changes, AND after a successful
  // mutation so the button flips immediately.
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [busy, setBusy] = useState(false);
  // Accepted friends count of the PROFILE wallet — separate from the
  // viewer's count. Drives the "N friends" pill in the header.
  const [friendCount, setFriendCount] = useState<number | null>(null);
  // Pending incoming + outgoing requests on the OWNER's own profile — used
  // to surface a "you have N invites" hint inside the owner-only section.
  const [pendingIn, setPendingIn] = useState<number>(0);

  // Refetch relationship + friend count when the viewer or the profile
  // changes. `refreshTick` is bumped by mutation handlers to force a
  // re-fetch after the server has updated.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rel, lists] = await Promise.all([
          viewer
            ? getFriendState(viewer, profile.wallet)
            : Promise.resolve<Relationship>("strangers"),
          getFriendLists(profile.wallet),
        ]);
        if (cancelled) return;
        setRelationship(rel);
        setFriendCount(lists.count);
        if (isOwner) setPendingIn(lists.pendingIn.length);
      } catch {
        // Network blip — leave the last-known state visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewer, profile.wallet, isOwner, refreshTick]);

  async function runFriendAction(action: "request" | "accept" | "reject" | "unfriend") {
    if (!viewer || !signMessage) {
      pushToast("error", "Connect a wallet that supports signMessage.");
      return;
    }
    setBusy(true);
    try {
      await sendFriendAction({
        wallet: viewer,
        signMessage,
        target: profile.wallet,
        action,
      });
      pushToast(
        "success",
        action === "request"
          ? "Friend request sent."
          : action === "accept"
            ? "Friend request accepted."
            : action === "reject"
              ? "Friend request rejected."
              : "Removed from friends.",
      );
      setRefreshTick((n) => n + 1);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Real on-chain stats. Stays null until the first fetch resolves; the UI
  // shows muted dashes during that brief load. Refetch when the wallet
  // changes (different profile) OR after the user saves a profile edit
  // (cheap; the user expects the card to feel live).
  const [stats, setStats] = useState<WalletStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStats(null);
    (async () => {
      try {
        const s = await fetchWalletStats({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          wallet: profile.wallet,
        });
        if (!cancelled) setStats(s);
      } catch {
        // RPC blip — leave stats null so the dashes stay visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, profile.wallet]);

  // 14-week buy activity for the sparkbar. Independent from the stats fetch
  // because it requires N getSignaturesForAddress calls (one per batch) and
  // we don't want to block the headline numbers behind those.
  const [activity, setActivity] = useState<WeeklyActivity | null>(null);
  useEffect(() => {
    let cancelled = false;
    setActivity(null);
    (async () => {
      try {
        const a = await fetchWalletActivity({
          rpcUrl: connection.rpcEndpoint,
          programId: PROGRAM_ID,
          wallet: profile.wallet,
        });
        if (!cancelled) setActivity(a);
      } catch {
        // Leave null; the bar grid stays in its muted "pending" state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, profile.wallet]);

  const initial =
    (profile.pseudo?.charAt(0) ?? profile.wallet.charAt(0) ?? "?").toUpperCase();

  return (
    <>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        {/* Header — avatar, identity stack, PnL/CTA stack */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5">
          <WalletIdenticon
            wallet={profile.wallet}
            size={72}
            imageUrl={
              profile.avatar?.kind === "upload" ? profile.avatar.url : null
            }
            initialOverride={initial}
          />

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold uppercase tracking-tight">
                {profile.pseudo ?? shortAddress(profile.wallet)}
              </span>
              {/* Rank pill — PHASE 2 will populate; placeholder for now */}
            </div>
            <a
              href={explorerAddressUrl(profile.wallet, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-neutral-500 transition hover:text-neutral-300"
            >
              {shortAddress(profile.wallet)} ↗
            </a>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 font-mono text-[11px] text-neutral-500">
              {profile.xHandle && (
                <a
                  href={`https://x.com/${profile.xHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-neutral-200"
                >
                  <XLogo />
                  @{profile.xHandle}
                  {profile.xVerified && (
                    <span style={{ color: MINT }}>✓</span>
                  )}
                </a>
              )}
              <span className="text-neutral-600">
                {friendCount === null
                  ? "…"
                  : `${friendCount} friend${friendCount === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>

          {/* Right stack: PnL hero + action button */}
          <div className="flex flex-col items-end gap-2">
            {profile.isPublic ? (
              <>
                <div className="text-right">
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    Net PnL
                  </span>
                  {stats ? (
                    <span
                      className="font-display text-xl font-bold tabular-nums leading-none"
                      style={{
                        color:
                          stats.netPnLLamports >= 0n ? MINT : "#e89999",
                      }}
                    >
                      {stats.netPnLLamports >= 0n ? "+" : "−"}
                      {formatSol(
                        stats.netPnLLamports < 0n
                          ? -stats.netPnLLamports
                          : stats.netPnLLamports,
                      )}
                    </span>
                  ) : (
                    <span className="font-display text-xl font-bold tabular-nums leading-none text-neutral-600">
                      —
                    </span>
                  )}
                </div>
                <ActionButton
                  isOwner={isOwner}
                  relationship={relationship}
                  busy={busy}
                  onEdit={() => setEditOpen(true)}
                  onAction={runFriendAction}
                />
              </>
            ) : (
              <>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  🔒 Private
                </span>
                <ActionButton
                  isOwner={isOwner}
                  relationship={relationship}
                  busy={busy}
                  onEdit={() => setEditOpen(true)}
                  onAction={runFriendAction}
                />
              </>
            )}
          </div>
        </div>

        {/* Stats / activity / badges — public only OR own profile */}
        {(profile.isPublic || isOwner) && (
          <>
            {!profile.isPublic && isOwner && (
              <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-900/20 p-2 font-mono text-[10px] uppercase tracking-widest text-amber-300">
                Private — only you see this section
              </p>
            )}
            {isOwner && pendingIn > 0 && (
              <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-900/20 p-2 font-mono text-[10px] uppercase tracking-widest text-amber-300">
                ⋯ {pendingIn} pending friend request{pendingIn === 1 ? "" : "s"} —
                visit the requesters&apos; profiles to respond
              </p>
            )}
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              <StatTile
                label="Tickets"
                value={stats ? stats.tickets.toString() : "—"}
                sub={stats ? `${stats.pools} pool${stats.pools === 1 ? "" : "s"}` : "loading"}
              />
              <StatTile
                label="Wins"
                value={stats ? stats.wins.toString() : "—"}
                valueColor={MINT}
                sub={
                  stats
                    ? stats.resolvedPools > 0
                      ? `${stats.winRatePct.toFixed(1)}% rate`
                      : "no resolved"
                    : "loading"
                }
              />
              <StatTile
                label="Spent"
                value={stats ? formatSol(stats.spentLamports) : "—"}
                sub="all-time"
              />
              <StatTile
                label="Won"
                value={stats ? formatSol(stats.wonLamports) : "—"}
                valueColor={MINT}
                sub={
                  stats && stats.bestWinLamports > 0n
                    ? `best ${formatSol(stats.bestWinLamports)}`
                    : "no wins yet"
                }
              />
            </div>

            {/* Activity sparkbar — 14 weekly bars, oldest to newest.
                Heights normalised to the wallet's peak week so a low-volume
                wallet's pattern still reads, while a whale's biggest week
                still hits 100%. Zero-buy weeks render as a 1-pixel hairline
                so the column position is visible. */}
            <div className="mt-4 border-t border-dashed border-neutral-800 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  Activity · 14 weeks
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-widest"
                  style={{
                    color:
                      activity && activity.last7d > 0 ? MINT : "#737373",
                  }}
                >
                  {activity
                    ? activity.last7d > 0
                      ? `+${activity.last7d} last 7d`
                      : "no buys last 7d"
                    : "loading…"}
                </span>
              </div>
              <div className="flex h-7 items-end gap-0.5">
                {(() => {
                  const weeks = activity?.weeks ?? Array(14).fill(0);
                  const peak = Math.max(1, ...weeks);
                  return weeks.map((count, i) => {
                    const pct = (count / peak) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm transition-all duration-300"
                        title={
                          activity
                            ? count === 0
                              ? "0 buys"
                              : `${count} buy${count === 1 ? "" : "s"} · ${13 - i} weeks ago`
                            : "loading"
                        }
                        style={{
                          height: count === 0 ? "2px" : `${Math.max(8, pct)}%`,
                          background:
                            count === 0
                              ? "#262626"
                              : MINT,
                          opacity: count === 0 ? 1 : 0.5 + (pct / 100) * 0.5,
                        }}
                      />
                    );
                  });
                })()}
              </div>
            </div>

            {/* Badges — Phase 3+ rule-derived. Empty state for now. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                No badges yet
              </span>
            </div>
          </>
        )}

        {/* Private + viewer is NOT owner — minimal section */}
        {!profile.isPublic && !isOwner && (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              🔒 This profile is private
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Only the wallet address, pseudo, and avatar are visible. Send a
              friend request to see more.
            </p>
          </div>
        )}
      </div>

      {editOpen && (
        <EditProfileModal
          initial={profile}
          onSaved={(next) => {
            onProfileUpdated?.(next);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function ActionButton({
  isOwner,
  relationship,
  busy,
  onEdit,
  onAction,
}: {
  isOwner: boolean;
  relationship: Relationship | null;
  busy: boolean;
  onEdit: () => void;
  onAction: (a: "request" | "accept" | "reject" | "unfriend") => void;
}) {
  if (isOwner) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600"
      >
        ⚙ Edit profile
      </button>
    );
  }

  // Loading the relationship — render a disabled placeholder so the layout
  // doesn't shift when the lookup resolves.
  if (relationship === null) {
    return (
      <button
        type="button"
        disabled
        className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500"
      >
        Loading…
      </button>
    );
  }

  // Incoming pending request — render BOTH accept and reject buttons so the
  // viewer can act in one tap. The "Friends" / "Add friend" / "Requested"
  // states each get a single button below.
  if (relationship === "pending-in") {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("accept")}
          className="rounded-full bg-[#88cfc4] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110 disabled:opacity-50"
        >
          ✓ Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("reject")}
          className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 disabled:opacity-50"
        >
          ✕ Reject
        </button>
      </div>
    );
  }

  if (relationship === "pending-out") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction("unfriend")}
        title="Cancel your friend request"
        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400 transition hover:border-amber-500/50 disabled:opacity-50"
      >
        ⋯ Requested
      </button>
    );
  }

  if (relationship === "friends") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction("unfriend")}
        title="Click to unfriend"
        className="rounded-full border bg-[#88cfc4]/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#88cfc4] transition hover:bg-[#88cfc4]/20 disabled:opacity-50"
        style={{ borderColor: "rgba(136, 207, 196, 0.3)" }}
      >
        ✓ Friends
      </button>
    );
  }

  // relationship === "strangers"
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAction("request")}
      className="rounded-full bg-[#88cfc4] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110 disabled:opacity-50"
    >
      + Add friend
    </button>
  );
}

function StatTile({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div>
      <span className="block font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <div
        className="mt-1 font-display text-base font-bold tabular-nums leading-none"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] text-neutral-600">
          {sub}
        </div>
      )}
    </div>
  );
}

function XLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="currentColor"
      aria-hidden
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletIdenticon } from "@/components/WalletIdenticon";

// Heavy form modal — only loaded when the owner clicks "Edit profile".
// Saves ~6 kB on the initial /u/[handle] payload for the common case
// (a viewer who is NOT the profile owner and never opens the editor).
const EditProfileModal = dynamic(
  () =>
    import("@/components/EditProfileModal").then((m) => ({
      default: m.EditProfileModal,
    })),
  { ssr: false },
);
import { explorerAddressUrl } from "@/lib/explorer-url";
import { formatSol, shortAddress} from "@/lib/format";
import { usePseudo } from "@/lib/pseudo-cache";
import type { ProfileRow } from "@/lib/profile-client";
import { sendFriendAction, type Relationship } from "@/lib/friend-client";
import { useToast } from "@/components/Toast";
import { StatTile } from "@/components/ui/Stat";
import { useProfileData } from "@/hooks/useProfileData";
import { FriendsDrawer } from "@/components/FriendsDrawer";
import Link from "next/link";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // All three data fetches (friendship, stats, activity) live in one hook
  // so this component stays focused on layout. `refresh()` retriggers only
  // the friendship lookup — stats/activity don't change on a friend action.
  const {
    relationship,
    friendCount,
    pendingIn,
    pendingInWallets,
    stats,
    activity,
    refresh,
  } = useProfileData({
    wallet: profile.wallet,
    viewer,
    isOwner,
    connection,
  });
  /** Per-row busy state for the inline accept/decline buttons —
   *  separate from the header-level `busy` so multiple rows can resolve
   *  without locking the whole card. */
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function respondToRequest(
    requester: string,
    accept: boolean,
  ): Promise<void> {
    if (!viewer || !signMessage) {
      pushToast("error", "Connect a wallet that supports signMessage.");
      return;
    }
    setRowBusy(requester);
    try {
      await sendFriendAction({
        wallet: viewer,
        signMessage,
        target: requester,
        action: accept ? "accept" : "reject",
      });
      pushToast(
        "success",
        accept ? "Friend request accepted." : "Friend request rejected.",
      );
      refresh();
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setRowBusy(null);
    }
  }

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
      refresh();
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
              {/* Friend count — clickable when the friend list is visible to
                  the viewer (public profile, or the owner looking at their
                  own private profile). Private profiles viewed by strangers
                  keep the count as plain text. */}
              {friendCount === null ? (
                <span className="text-neutral-600">…</span>
              ) : profile.isPublic || isOwner ? (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  disabled={friendCount === 0}
                  aria-label={`Open friends list — ${friendCount} ${
                    friendCount === 1 ? "friend" : "friends"
                  }`}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  👥 {friendCount} friend{friendCount === 1 ? "" : "s"}
                  {friendCount > 0 && <span aria-hidden>▸</span>}
                </button>
              ) : (
                <span className="text-neutral-600">
                  {friendCount} friend{friendCount === 1 ? "" : "s"}
                </span>
              )}
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
              <div className="mt-3 rounded-lg border border-amber-700/40 bg-amber-900/20 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber-300">
                  ⋯ {pendingIn} pending friend request
                  {pendingIn === 1 ? "" : "s"}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {pendingInWallets.map((requester) => (
                    <PendingRequestRow
                      key={requester}
                      requester={requester}
                      busy={rowBusy === requester}
                      onRespond={(accept) =>
                        respondToRequest(requester, accept)
                      }
                    />
                  ))}
                </ul>
              </div>
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

      {/* Friends drawer — gated by privacy at render time. Friend list is
          public info (one-hop), so private profiles still expose their
          accepted-friends list to the owner; non-owner viewers see a
          disabled pill (handled above) and never instantiate the drawer. */}
      <FriendsDrawer
        wallet={profile.wallet}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}

/** Row inside the pending-friend-requests block on the owner's profile.
 *  Shows the requester's pseudo (resolved via UserName) + short address,
 *  links to their profile, and surfaces Accept / Decline buttons that
 *  run the signed friend-action flow directly without leaving the page. */
function PendingRequestRow({
  requester,
  busy,
  onRespond,
}: {
  requester: string;
  busy: boolean;
  onRespond: (accept: boolean) => void;
}) {
  // Look up the pseudo directly so we can pick the right layout:
  //   • pseudo claimed → pseudo as heading, shortAddress as subheading
  //   • no pseudo      → just the short address (no subheading) —
  //                      otherwise we'd render the wallet twice in
  //                      two different truncations.
  const pseudo = usePseudo(requester);
  return (
    <li className="flex items-center gap-2 rounded-lg border border-amber-700/30 bg-neutral-950/60 px-2.5 py-2">
      <Link
        href={`/u/${encodeURIComponent(requester)}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 transition hover:opacity-80"
        title={`${requester} — view profile`}
      >
        <WalletIdenticon wallet={requester} size={32} />
        <span className="flex min-w-0 flex-col">
          {pseudo ? (
            <>
              <span className="truncate text-sm font-semibold text-neutral-100">
                {pseudo}
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                {shortAddress(requester)}
              </span>
            </>
          ) : (
            <span className="truncate font-mono text-sm font-semibold text-neutral-100">
              {shortAddress(requester)}
            </span>
          )}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onRespond(true)}
        disabled={busy}
        aria-label={`Accept friend request from ${requester}`}
        style={{ background: "#88cfc4", color: "#000" }}
        className="rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "…" : "Accept"}
      </button>
      <button
        type="button"
        onClick={() => onRespond(false)}
        disabled={busy}
        aria-label={`Decline friend request from ${requester}`}
        className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Decline
      </button>
    </li>
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

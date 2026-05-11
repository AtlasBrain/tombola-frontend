"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { EditProfileModal } from "@/components/EditProfileModal";
import { explorerAddressUrl } from "@/lib/explorer-url";
import type { ProfileRow } from "@/lib/profile-client";

interface Props {
  profile: ProfileRow;
  rpcUrl: string;
  /** Replaces this row when the user saves their edits — wired to `setState`
   *  in the parent page. */
  onProfileUpdated?: (next: ProfileRow) => void;
}

const MINT = "#88cfc4";

function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

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
  const { publicKey } = useWallet();
  const viewer = publicKey?.toBase58() ?? null;
  const isOwner = viewer !== null && viewer === profile.wallet;
  const [editOpen, setEditOpen] = useState(false);

  // PHASE 2 will swap these placeholders for real stats derived from
  // getProgramAccounts. For now they're zeros — visible only on the owner's
  // own public profile so they can SEE that the layout will host them later.
  const stats = {
    netPnLSol: 0,
    tickets: 0,
    pools: 0,
    wins: 0,
    winRate: 0,
    spent: 0,
    won: 0,
    bestWin: 0,
  };

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
                {profile.pseudo ?? shortAddr(profile.wallet)}
              </span>
              {/* Rank pill — PHASE 2 will populate; placeholder for now */}
            </div>
            <a
              href={explorerAddressUrl(profile.wallet, rpcUrl)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-neutral-500 transition hover:text-neutral-300"
            >
              {shortAddr(profile.wallet)} ↗
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
              {/* Friends count is wired in Phase 3; show a placeholder
                  for layout reference. */}
              <span className="text-neutral-600">0 friends</span>
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
                  <span
                    className="font-display text-xl font-bold tabular-nums leading-none"
                    style={{
                      color: stats.netPnLSol >= 0 ? MINT : "#e89999",
                    }}
                  >
                    {stats.netPnLSol >= 0 ? "+" : ""}
                    {stats.netPnLSol.toFixed(2)} SOL
                  </span>
                </div>
                <ActionButton
                  isOwner={isOwner}
                  onEdit={() => setEditOpen(true)}
                />
              </>
            ) : (
              <>
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  🔒 Private
                </span>
                <ActionButton
                  isOwner={isOwner}
                  onEdit={() => setEditOpen(true)}
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
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              <StatTile label="Tickets" value={stats.tickets.toString()} sub={`${stats.pools} pools`} />
              <StatTile label="Wins" value={stats.wins.toString()} valueColor={MINT} sub={`${stats.winRate.toFixed(1)}% rate`} />
              <StatTile label="Spent" value={`${stats.spent.toFixed(2)} SOL`} sub="all-time" />
              <StatTile label="Won" value={`${stats.won.toFixed(2)} SOL`} valueColor={MINT} sub={`best ${stats.bestWin.toFixed(2)}`} />
            </div>

            {/* Activity sparkbar — Phase 4 wires real data. Placeholder grid
                stays so the layout is the final shape. */}
            <div className="mt-4 border-t border-dashed border-neutral-800 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  Activity · 14 weeks
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                  · pending
                </span>
              </div>
              <div className="flex h-7 items-end gap-0.5">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-neutral-900"
                    style={{ height: "30%" }}
                  />
                ))}
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
  onEdit,
}: {
  isOwner: boolean;
  onEdit: () => void;
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
  // Phase 3 wires real friend-request state. For Phase 1 we render the
  // happy-path "Add friend" CTA; clicks just no-op for now.
  return (
    <button
      type="button"
      onClick={() => {}}
      disabled
      title="Friend requests ship in Phase 3"
      className="rounded-full bg-[#88cfc4] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black opacity-50"
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

"use client";

// Unified identity chip in the header. Replaces the old
// MyProfileButton + ConnectWalletButton duo.
//
// Two render modes:
//   • Disconnected → render wallet-adapter's WalletMultiButton so the
//     "Select Wallet" UX stays standard. Users never lose the familiar
//     connect button.
//   • Connected → render our custom pill (avatar · pseudo · short
//     address · caret) with a dropdown that bundles every action the
//     two old buttons used to expose:
//        VIEW PROFILE         /u/<handle>
//        EDIT PROFILE         /u/<wallet>?edit=1
//        COPY ADDRESS         clipboard
//        VIEW ON EXPLORER     explorer link
//        SWITCH WALLET        disconnect (returns to "Select Wallet" UX)
//        DISCONNECT           disconnect
//
// Mobile rendering is delegated to <IdentityPill mobile /> — same
// component, full-width chrome for inside the hamburger drawer.

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { explorerAddressUrl } from "@/lib/explorer-url";
import { fetchProfile, type ProfileRow } from "@/lib/profile-client";
import { getFriendLists } from "@/lib/friend-client";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { CORAL, MINT } from "@/lib/colors";
import { shortAddress } from "@/lib/format";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton,
    ),
  { ssr: false },
);

interface Props {
  /** Mobile-drawer rendering: full-width chrome, no popover. The
   *  mobile menu shows the connect/disconnect controls inline so the
   *  user doesn't need a second tap. */
  mobile?: boolean;
}

export function IdentityPill({ mobile = false }: Props = {}) {
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pending-friend count, mirrored from MyProfileButton — drives the
  // small badge on the avatar.
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

  // Pull the connected wallet's profile (pseudo, avatar, isPublic).
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
        // Network blip — chip keeps rendering against the raw wallet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // Close popover on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const root = containerRef.current;
      if (root && !root.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Disconnected state — let wallet-adapter handle "Select Wallet".
  if (!publicKey) {
    if (mobile) {
      return (
        <div className="px-2">
          <WalletMultiButton style={{ width: "100%" }} />
        </div>
      );
    }
    return <WalletMultiButton />;
  }

  const wallet = publicKey.toBase58();
  const handle = profile?.pseudo ?? wallet;
  const label = profile?.pseudo ?? shortAddress(wallet);
  const imageUrl =
    profile?.avatar?.kind === "upload" ? profile.avatar.url : null;
  const initial = (profile?.pseudo?.charAt(0) ?? wallet.charAt(0) ?? "?")
    .toUpperCase();

  return (
    <div ref={containerRef} className={mobile ? "px-2" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          pendingIn > 0
            ? `Identity menu — ${pendingIn} pending friend request${pendingIn === 1 ? "" : "s"}`
            : "Identity menu"
        }
        // Mobile: full-width flat row inside the hamburger drawer.
        // Desktop: brand-mint pill with ticket-corner tear (matches
        // the BUY A TICKET / LEARN MORE CTAs in feel + hover effect).
        // Typography mockup B: pseudo in Space Grotesk (display
        // face — identity), address in Space Mono (technical face —
        // mirrors the established hierarchy on /u/[handle] pages).
        // The fx-tear ::before paints the mint surface and animates
        // its clip-path; chip-flip rotates the caret 45° on hover.
        style={mobile ? undefined : { ["--tear-bg" as never]: MINT }}
        className={
          mobile
            ? "flex h-12 w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-mono text-xs uppercase tracking-widest text-neutral-200 transition hover:border-neutral-600"
            : "btn-fx fx-tear group inline-flex items-center gap-2 py-1.5 pl-1.5 pr-1.5 text-neutral-900 transition"
        }
      >
        <IdentityAvatar
          wallet={wallet}
          imageUrl={imageUrl}
          initial={initial}
          pendingIn={pendingIn}
          mobile={mobile}
        />
        {mobile ? (
          <span className="flex-1 truncate text-left">{label}</span>
        ) : (
          <>
            {/* `capitalize` upper-cases the first letter of the pseudo
                so e.g. "marwan" reads as "Marwan" (the pseudo regex
                forces lowercase, but the display can still be name-
                like). When falling back to a short wallet address
                we keep it case-sensitive (base58). */}
            <span
              className={`ml-1 max-w-[140px] truncate font-display text-[14px] font-bold leading-none tracking-tight ${
                profile?.pseudo ? "capitalize" : ""
              }`}
            >
              {label}
            </span>
            {/* Address column — visible at xl+ so the pill stays
                meaningful on wide screens. Mono face matches the
                /u/[handle] subheading + every other on-page address. */}
            {profile?.pseudo && (
              <>
                <span
                  aria-hidden
                  className="hidden h-3.5 w-px bg-black/20 xl:inline-block"
                />
                <span className="hidden font-mono text-[10px] font-normal leading-none text-black/55 xl:inline">
                  {shortAddress(wallet)}
                </span>
              </>
            )}
            <span
              aria-hidden
              className="chip-flip ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-black text-[11px] font-bold text-neutral-100"
            >
              ▾
            </span>
          </>
        )}
      </button>

      {!mobile && open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 flex min-w-[260px] flex-col rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-2xl shadow-black/70"
        >
          <IdentityHeader wallet={wallet} pseudo={profile?.pseudo ?? null} />
          <MenuLink
            href={`/u/${encodeURIComponent(handle)}`}
            onClick={() => setOpen(false)}
            glyph={<UserGlyph />}
          >
            VIEW PROFILE
          </MenuLink>
          <MenuLink
            href={`/u/${encodeURIComponent(handle)}?edit=1`}
            onClick={() => setOpen(false)}
            glyph={<EditGlyph />}
          >
            EDIT PROFILE
          </MenuLink>
          <MenuLink
            href={explorerAddressUrl(wallet, connection.rpcEndpoint)}
            external
            onClick={() => setOpen(false)}
            glyph={<ExternalGlyph />}
          >
            VIEW ON EXPLORER
          </MenuLink>
          <div className="my-1 h-px bg-neutral-900" />
          <MenuButton
            onClick={async () => {
              setOpen(false);
              try {
                await navigator.clipboard.writeText(wallet);
              } catch {
                // Older browsers / Safari quirks — silently no-op rather
                // than leak an error toast. Users can still copy the
                // address from the explorer link.
              }
            }}
            glyph={<CopyGlyph />}
          >
            COPY ADDRESS
          </MenuButton>
          <MenuButton
            onClick={async () => {
              setOpen(false);
              try {
                await disconnect();
              } catch {
                // wallet-adapter throws on rare re-entrancy; safe to
                // swallow — the wallet's own UI also has a disconnect.
              }
            }}
            glyph={<SwitchGlyph />}
          >
            SWITCH WALLET
          </MenuButton>
          <MenuButton
            danger
            onClick={async () => {
              setOpen(false);
              try {
                await disconnect();
              } catch {
                // Same rationale as switch.
              }
            }}
            glyph={<DisconnectGlyph />}
          >
            DISCONNECT
          </MenuButton>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── sub-components ────────────────────────────

function IdentityAvatar({
  wallet,
  imageUrl,
  initial,
  pendingIn,
  mobile,
}: {
  wallet: string;
  imageUrl: string | null;
  initial: string;
  pendingIn: number;
  mobile: boolean;
}) {
  const size = mobile ? 28 : 26;
  return (
    <span className="relative inline-block">
      <WalletIdenticon
        wallet={wallet}
        size={size}
        imageUrl={imageUrl}
        initialOverride={initial}
      />
      {pendingIn > 0 && (
        <span
          aria-label={`${pendingIn} pending friend request${pendingIn === 1 ? "" : "s"}`}
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-black"
          style={{ background: "#88cfc4" }}
        >
          {pendingIn}
        </span>
      )}
    </span>
  );
}

function IdentityHeader({
  wallet,
  pseudo,
}: {
  wallet: string;
  pseudo: string | null;
}) {
  // Short string we display + the full string in the title attribute so
  // hover gives the exact pubkey. Copy-to-clipboard is one row below.
  const short = useMemo(() => shortAddress(wallet), [wallet]);
  return (
    <div className="border-b border-neutral-900 px-3 pb-3 pt-2.5">
      <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-neutral-100">
        {pseudo ? `@${pseudo}` : short}
      </p>
      <p
        className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500"
        title={wallet}
      >
        {short}
      </p>
    </div>
  );
}

function MenuLink({
  href,
  external,
  onClick,
  glyph,
  children,
}: {
  href: string;
  external?: boolean;
  onClick?: () => void;
  glyph?: React.ReactNode;
  children: React.ReactNode;
}) {
  const className =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-neutral-300 transition hover:bg-neutral-900 hover:text-neutral-100";
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      role="menuitem"
      onClick={onClick}
      className={className}
    >
      {glyph}
      <span className="flex-1">{children}</span>
    </a>
  ) : (
    <Link href={href} role="menuitem" onClick={onClick} className={className}>
      {glyph}
      <span className="flex-1">{children}</span>
    </Link>
  );
}

function MenuButton({
  onClick,
  danger,
  glyph,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  glyph?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition"
      style={
        danger
          ? { color: CORAL }
          : undefined
      }
    >
      {glyph}
      <span
        className={`flex-1 text-left transition ${
          danger
            ? "hover:[&]:opacity-100"
            : "text-neutral-300 hover:text-neutral-100"
        }`}
      >
        {children}
      </span>
    </button>
  );
}

// ───────────────────────────── inline glyphs ─────────────────────────────

function UserGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function EditGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function ExternalGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500" aria-hidden>
      <path d="M14 3h7v7" />
      <path d="M21 3 10 14" />
      <path d="M21 14v7h-7" />
      <path d="M3 21l11-11" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function SwitchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500" aria-hidden>
      <path d="M16 17a4 4 0 0 0 0-8" />
      <circle cx="8" cy="13" r="5" />
    </svg>
  );
}

function DisconnectGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: CORAL }} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { MyProfileButton } from "@/components/MyProfileButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SearchPaletteHost } from "@/components/SearchPaletteHost";
import { ZeroBalanceBanner } from "@/components/ZeroBalanceBanner";
import { smoothScrollToId } from "@/lib/smooth-scroll";

type NavItem =
  | { kind: "anchor"; id: string; label: string }
  | { kind: "link"; href: string; label: string };

// Full nav — only renders on the homepage where the PUBLIC POOLS anchor
// actually exists; subroute version uses a cross-page link instead.
//
// HOW IT WORKS and FAQ used to live here but they're scroll-anchors that
// only existed on the homepage AND overflowed the desktop center column
// at mid widths (1100-1300px), overlapping the right-side controls.
// Both are still reachable: the homepage scrolls past them naturally,
// and the footer has direct links.
const NAV_HOMEPAGE: readonly NavItem[] = [
  { kind: "anchor", id: "pools",         label: "PUBLIC POOLS" },
  { kind: "link",   href: "/create",     label: "CREATE POOL" },
  { kind: "link",   href: "/my-tickets", label: "MY TICKETS" },
  { kind: "link",   href: "/leaderboard",label: "LEADERBOARD" },
];

// Subroute nav — only real routes (anchors don't exist outside homepage so
// they'd no-op). POOLS becomes a cross-page link to /#pools (browser scrolls
// after navigation). The current page is filtered out by hideHref below.
const NAV_SUBROUTE: readonly NavItem[] = [
  { kind: "link", href: "/#pools",      label: "POOLS" },
  { kind: "link", href: "/create",      label: "CREATE POOL" },
  { kind: "link", href: "/my-tickets",  label: "MY TICKETS" },
  { kind: "link", href: "/leaderboard", label: "LEADERBOARD" },
];

export function Header() {
  const pathname = usePathname();
  const isHomepage = pathname === "/";
  const hideHref =
    pathname.startsWith("/my-tickets")
      ? "/my-tickets"
      : pathname.startsWith("/leaderboard")
        ? "/leaderboard"
        : pathname === "/create" || pathname.startsWith("/create/")
          ? "/create"
          : null;
  const navItems = (isHomepage ? NAV_HOMEPAGE : NAV_SUBROUTE).filter(
    (item) => item.kind === "anchor" || item.href !== hideHref,
  );

  // Mobile menu state — closed by default. Toggled by the hamburger button.
  // Closes automatically when a nav item is tapped (the link / anchor handler
  // calls closeMenu).
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  function handleScroll(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      smoothScrollToId(id);
      closeMenu();
    };
  }

  return (
    // relative so the absolute mobile dropdown anchors here; z-50 so the
    // dropdown overlays Hero content (which has its own stacking contexts).
    //
    // The header spans the full viewport width (no max-w cap) so on wide
    // monitors the logo sits flush-left and the wallet/profile cluster
    // sits flush-right instead of pinching toward a centered 80rem
    // column. Page content below still respects its own max-w-7xl
    // container, so the body layout doesn't change.
    <header className="relative z-50 px-3 py-4 sm:px-4 sm:py-5">
      {/* Layout: logo flush-left, actions flush-right via flex
          justify-between. The nav is absolutely positioned and centered
          to the <header> (see <nav> below) so it aligns with the
          viewport's visual center axis (hero circle + "Where SOL wins
          big") rather than the center of whatever space is left between
          logo and actions. */}
      <div className="flex items-center justify-between gap-3">
        {/* LEFT: logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 sm:gap-2.5"
          onClick={closeMenu}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-white sm:h-[34px] sm:w-[34px]">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <line x1="12" y1="3"  x2="12" y2="6"  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="3"  y1="12" x2="6"  y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="18" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-base uppercase tracking-tight sm:text-lg">TOMBOLA</span>
        </Link>

        {/* CENTER: nav links — desktop only. Absolutely centered to the
            <header> (which is full-viewport-wide and position:relative)
            so the nav aligns with the viewport's visual center, not the
            grid's 1fr center. Because the right cluster (~600px) is much
            wider than the logo (~150px), the 1fr middle column's center
            sits left of viewport center — which made the nav misalign
            with the hero circle + "Where SOL wins big" axis. Absolute
            positioning sidesteps that by anchoring to the header itself.
            pointer-events-auto restores clicks (parent doesn't disable
            them but the wrapper is non-interactive otherwise). */}
        <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 sm:flex">
          {navItems.map((item) =>
            item.kind === "anchor" ? (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={handleScroll(item.id)}
                className="nav-link"
              >
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className="nav-link" onClick={closeMenu}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        {/* RIGHT: status + CTA + mobile menu toggle */}
        <div className="flex items-center gap-2">
          <SearchPaletteHost
            trigger={(openPalette) => (
              <button
                type="button"
                onClick={openPalette}
                aria-label="Search users"
                title="Search (⌘K or /)"
                className="hidden h-9 items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200 sm:inline-flex"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span>Search</span>
                <kbd className="ml-1 rounded border border-neutral-800 px-1 text-[9px] text-neutral-500">⌘K</kbd>
              </button>
            )}
          />
          <div className="hidden sm:block">
            <MyProfileButton />
          </div>
          <NotificationBell />
          <ConnectWalletButton />
          {/* Hamburger — visible below sm. The .ham-spin CSS in globals.css
              rotates the icon 180° while the bars morph into an × on .open.
              CSS-driven so the animation runs on every toggle without React
              mount/unmount churn. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className={`ham-spin ml-1 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100 transition-colors hover:border-neutral-600 sm:hidden ${
              menuOpen ? "open" : ""
            }`}
          >
            <span className="sr-only">{menuOpen ? "Close" : "Menu"}</span>
            <span className="ham-bars" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu — iris reveal. The panel is overlaid (absolute, does
          not push Hero), always rendered, and the open/close gesture is a
          clip-path circle that EXPANDS from the hamburger button's
          position (right edge, top of panel) so the menu literally
          unfolds out of the button you tapped.

          Origin computed from the panel's coord system:
            - panel hugs left-4/right-4 of the header
            - hamburger sits on the right side, ~18px in from the right edge
            - so origin x = `calc(100% - 18px)`, y = `0`
          Closed: circle(0% at origin) — fully clipped away.
          Open:   circle(150% at origin) — bigger than the panel diagonal,
                  so the whole panel is revealed.

          Tailwind doesn't have a token for these clip-path values so we
          set them inline via style. */}
      <nav
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
        style={{
          clipPath: menuOpen
            ? "circle(150% at calc(100% - 18px) 0)"
            : "circle(0% at calc(100% - 18px) 0)",
          opacity: menuOpen ? 1 : 0,
          transition:
            "clip-path 450ms cubic-bezier(0.55, 0, 0.2, 1), opacity 200ms ease-out",
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        className="absolute left-4 right-4 top-full mt-2 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-2 shadow-2xl shadow-black/70 backdrop-blur-md sm:hidden"
      >
        <div className="flex flex-col gap-1">
          {/* Mobile profile + search — desktop versions are
              `hidden sm:inline-flex` so without these explicit mobile
              rows the user has no path to either. */}
          <div className="px-2 py-2">
            <MyProfileButton mobile />
          </div>
          <SearchPaletteHost
            trigger={(openPalette) => (
              <button
                type="button"
                onClick={() => {
                  openPalette();
                  closeMenu();
                }}
                className="mx-2 mb-1 flex h-12 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-mono text-xs uppercase tracking-widest text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                tabIndex={menuOpen ? 0 : -1}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                Search players
              </button>
            )}
          />
          {navItems.map((item) =>
            item.kind === "anchor" ? (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={handleScroll(item.id)}
                className="flex h-12 items-center rounded-lg px-3 font-mono text-xs uppercase tracking-widest text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white"
                tabIndex={menuOpen ? 0 : -1}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className="flex h-12 items-center rounded-lg px-3 font-mono text-xs uppercase tracking-widest text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white"
                tabIndex={menuOpen ? 0 : -1}
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      </nav>
      {/* Zero-balance hint — surfaces when the connected wallet has 0
          lamports so first-time users don't get stuck at the "Buy"
          step with a confusing tx error. Dismissible per session. */}
      <ZeroBalanceBanner />
    </header>
  );
}

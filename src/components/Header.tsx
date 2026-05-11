"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { MyProfileButton } from "@/components/MyProfileButton";
import { NotificationBell } from "@/components/NotificationBell";
import { smoothScrollToId } from "@/lib/smooth-scroll";

type NavItem =
  | { kind: "anchor"; id: string; label: string }
  | { kind: "link"; href: string; label: string };

// Full nav — only renders on the homepage where the anchor sections actually
// exist. PUBLIC POOLS / HOW IT WORKS / FAQ all scroll to ids inside the
// homepage's long-form layout, so on any other route they'd no-op.
const NAV_HOMEPAGE: readonly NavItem[] = [
  { kind: "anchor", id: "pools",         label: "PUBLIC POOLS" },
  { kind: "link",   href: "/create",     label: "PRIVATE" },
  { kind: "link",   href: "/my-tickets", label: "MY TICKETS" },
  { kind: "link",   href: "/leaderboard",label: "LEADERBOARD" },
  { kind: "anchor", id: "how-it-works",  label: "HOW IT WORKS" },
  { kind: "anchor", id: "faq",           label: "FAQ" },
];

// Subroute nav — only real routes (anchors don't exist outside homepage so
// they'd no-op). POOLS becomes a cross-page link to /#pools (browser scrolls
// after navigation). The current page is filtered out by hideHref below.
const NAV_SUBROUTE: readonly NavItem[] = [
  { kind: "link", href: "/#pools",      label: "POOLS" },
  { kind: "link", href: "/create",      label: "PRIVATE" },
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
    <header className="relative z-50 mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
        {/* LEFT: logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 sm:gap-2.5 sm:justify-self-start"
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

        {/* CENTER: nav links — desktop only */}
        <nav className="hidden items-center gap-1 justify-self-center sm:flex">
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
        <div className="flex items-center gap-2 sm:justify-self-end">
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
          <div className="px-3 py-2">
            <MyProfileButton />
          </div>
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
    </header>
  );
}

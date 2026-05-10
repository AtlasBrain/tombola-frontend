"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkPill } from "@/components/NetworkPill";
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
  { kind: "anchor", id: "how-it-works",  label: "HOW IT WORKS" },
  { kind: "anchor", id: "faq",           label: "FAQ" },
];

// Subroute nav — only real routes (anchors don't exist outside homepage so
// they'd no-op). POOLS becomes a cross-page link to /#pools (browser scrolls
// after navigation). The current page is filtered out by hideHref below.
const NAV_SUBROUTE: readonly NavItem[] = [
  { kind: "link", href: "/#pools",     label: "POOLS" },
  { kind: "link", href: "/create",     label: "PRIVATE" },
  { kind: "link", href: "/my-tickets", label: "MY TICKETS" },
];

export function Header() {
  const pathname = usePathname();
  const isHomepage = pathname === "/";
  const hideHref =
    pathname.startsWith("/my-tickets")
      ? "/my-tickets"
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
            <NetworkPill />
          </div>
          <ConnectWalletButton />
          {/* Hamburger — visible below sm. Animates between bars and × on toggle. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 sm:hidden"
          >
            <span className="sr-only">{menuOpen ? "Close" : "Menu"}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              {menuOpen ? (
                <>
                  <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <line x1="2" y1="4"  x2="14" y2="4"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="2" y1="8"  x2="14" y2="8"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu — overlays page content (absolute, doesn't
          push Hero down) with a soft slide-in. Always rendered; opacity +
          translate-y + pointer-events toggle so the open/close transition
          is smooth instead of an instant React mount/unmount. inset-x
          mirrors the header's horizontal padding so the panel hugs the
          edges of the page like the rest of the layout. */}
      <nav
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
        className={`absolute top-full left-4 right-4 mt-2 origin-top rounded-2xl border border-neutral-800 bg-neutral-950/95 p-2 shadow-2xl shadow-black/70 backdrop-blur-md transition duration-200 ease-out sm:hidden ${
          menuOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="px-3 py-2">
            <NetworkPill />
          </div>
          {navItems.map((item, i) =>
            item.kind === "anchor" ? (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={handleScroll(item.id)}
                style={{
                  // small staggered delay so items cascade in when the menu
                  // opens — adds polish at near-zero cost
                  transitionDelay: menuOpen ? `${i * 25}ms` : "0ms",
                }}
                className={`flex h-12 items-center rounded-lg px-3 font-mono text-xs uppercase tracking-widest text-neutral-300 transition hover:bg-neutral-900 hover:text-white ${
                  menuOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                }`}
                tabIndex={menuOpen ? 0 : -1}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                style={{
                  transitionDelay: menuOpen ? `${i * 25}ms` : "0ms",
                }}
                className={`flex h-12 items-center rounded-lg px-3 font-mono text-xs uppercase tracking-widest text-neutral-300 transition hover:bg-neutral-900 hover:text-white ${
                  menuOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                }`}
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

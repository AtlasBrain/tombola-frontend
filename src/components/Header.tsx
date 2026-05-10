"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkPill } from "@/components/NetworkPill";
import { smoothScrollToId } from "@/lib/smooth-scroll";

type NavItem =
  | { kind: "anchor"; id: string; label: string }
  | { kind: "link"; href: string; label: string };

// Full nav — only renders on the homepage where the anchor sections actually
// exist. POOLS/HOW IT WORKS/STATS/FAQ all scroll to ids inside the homepage's
// long-form layout, so on any other route they'd no-op and feel broken.
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
  // Hide whichever item points at the current route so we don't render a
  // link that goes to itself. /create/* and /pool/private/* both belong to
  // the "PRIVATE" cluster — suppress that link too while inside.
  const hideHref =
    pathname.startsWith("/my-tickets")
      ? "/my-tickets"
      : pathname === "/create" || pathname.startsWith("/create/")
        ? "/create"
        : null;
  const navItems = (isHomepage ? NAV_HOMEPAGE : NAV_SUBROUTE).filter(
    (item) => item.kind === "anchor" || item.href !== hideHref,
  );

  function handleScroll(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      smoothScrollToId(id);
    };
  }

  return (
    <header className="mx-auto max-w-7xl px-6 py-5">
      <div className="grid grid-cols-3 items-center gap-4">
        {/* LEFT: logo */}
        <Link href="/" className="flex items-center gap-2.5 justify-self-start">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-white">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <line x1="12" y1="3"  x2="12" y2="6"  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="3"  y1="12" x2="6"  y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="18" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-lg uppercase tracking-tight">TOMBOLA</span>
        </Link>

        {/* CENTER: nav links */}
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
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ),
          )}
        </nav>

        {/* RIGHT: status + CTA */}
        <div className="flex items-center gap-2 justify-self-end">
          <NetworkPill />
          <ConnectWalletButton />
        </div>
      </div>
    </header>
  );
}

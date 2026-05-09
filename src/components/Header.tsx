"use client";

import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkPill } from "@/components/NetworkPill";
import { smoothScrollToId } from "@/lib/smooth-scroll";

const NAV_ITEMS = [
  { id: "pools",         label: "POOLS" },
  { id: "how",           label: "HOW IT WORKS" },
  { id: "stats",         label: "STATS" },
  { id: "faq",           label: "FAQ" },
] as const;

export function Header() {
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
          {NAV_ITEMS.map((item) => (
            <a key={item.id} href={`#${item.id}`} onClick={handleScroll(item.id)} className="nav-link">
              {item.label}
            </a>
          ))}
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

"use client";

import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkPill } from "@/components/NetworkPill";
import { smoothScrollToId } from "@/lib/smooth-scroll";

const NAV_ITEMS = [
  { id: "pools",         label: "POOLS" },
  { id: "how-it-works",  label: "HOW IT WORKS" },
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
    <header className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-5">
      <Link href="/" className="flex items-center gap-2 justify-self-start">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-white">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4"  fill="currentColor" />
          <line x1="12" y1="2"  x2="12" y2="6"  stroke="currentColor" strokeWidth="2" />
          <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
          <line x1="2"  y1="12" x2="6"  y2="12" stroke="currentColor" strokeWidth="2" />
          <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="font-display text-base tracking-tight text-white">TOMBOLA</span>
      </Link>

      <nav className="hidden items-center gap-1 justify-self-center sm:flex">
        {NAV_ITEMS.map((item) => (
          <a key={item.id} href={`#${item.id}`} onClick={handleScroll(item.id)} className="nav-link">
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-3 justify-self-end">
        <NetworkPill />
        <ConnectWalletButton />
      </div>
    </header>
  );
}

"use client";

// Chrome around every /admin/* page once the gate has passed.
//
// Top bar: brand + ADMIN badge, navigation (Overview / Users / Pools /
// Treasury / Risk), authed wallet display, session-ends-in countdown,
// logout button.
//
// The nav is internal-only — nothing in the public Header ever links
// to /admin/*.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/format";
import { CORAL, MINT } from "@/lib/colors";

const NAV: ReadonlyArray<{ href: string; label: string; enabled: boolean }> = [
  { href: "/admin", label: "OVERVIEW", enabled: true },
  // Phase 2+ — surfaces as visible-but-disabled so the user knows
  // they're coming.
  { href: "/admin/users", label: "USERS", enabled: false },
  { href: "/admin/pools", label: "POOLS", enabled: false },
  { href: "/admin/treasury", label: "TREASURY", enabled: false },
  { href: "/admin/risk", label: "RISK", enabled: false },
];

interface Props {
  wallet: string;
  expSec: number;
  children: React.ReactNode;
}

export function AdminShell({ wallet, expSec, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const minsLeft = Math.max(0, Math.floor((expSec - now) / 60));
  const secsLeft = Math.max(0, expSec - now);

  async function logout() {
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch {
      // Even if the request fails, force a reload — the cookie deletion
      // is best-effort and the gate will re-check.
    }
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-neutral-900/80 bg-neutral-950/90 px-8 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <line x1="12" y1="3" x2="12" y2="6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="3" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="18" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              TOMBOLA
            </span>
          </Link>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
            style={{ borderColor: `${CORAL}55`, color: CORAL }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: CORAL, boxShadow: `0 0 0 3px ${CORAL}33` }}
            />
            ADMIN
          </span>
        </div>

        <nav className="flex gap-1 font-mono text-[11px] uppercase tracking-widest">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const cls = active
              ? "bg-neutral-900 text-neutral-100"
              : item.enabled
                ? "text-neutral-400 hover:text-neutral-100"
                : "text-neutral-700 cursor-not-allowed";
            return item.enabled ? (
              <Link key={item.href} href={item.href} className={`rounded-lg px-3 py-1.5 transition ${cls}`}>
                {item.label}
              </Link>
            ) : (
              <span key={item.href} className={`rounded-lg px-3 py-1.5 ${cls}`} title="Phase 2+">
                {item.label}
                <span className="ml-1 text-[9px] text-neutral-700">SOON</span>
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: MINT, boxShadow: `0 0 0 3px ${MINT}33` }}
            />
            {shortAddress(wallet)}
          </span>
          <span className="text-neutral-600" title={`Expires at ${new Date(expSec * 1000).toLocaleTimeString()}`}>
            {secsLeft < 60 ? `${secsLeft}S LEFT` : `${minsLeft}M LEFT`}
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-neutral-800 px-2.5 py-1 text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-100"
          >
            LOGOUT
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

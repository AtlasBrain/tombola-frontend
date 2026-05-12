"use client";

// Generic overflow popover for the header nav.
//
// Holds links that don't fit in the primary nav (HOW IT WORKS, FAQ,
// GitHub, Docs, Roadmap, etc.). Opens on click, closes on outside
// click or Escape. Closes after a link is followed.
//
// The container is `position: relative` because the parent <nav> is
// already absolutely positioned + centered; the popover anchors below
// the button.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CORAL } from "@/lib/colors";

export interface NavMoreItem {
  label: string;
  /** Internal route. Use `external` for off-site links. */
  href: string;
  /** Optional emoji / glyph rendered before the label. */
  glyph?: string;
  /** When true, opens in a new tab with rel="noreferrer". */
  external?: boolean;
  /** Visually demote a row (e.g. for "Press kit"). */
  muted?: boolean;
  /** When true, the item only appears in the popover below xl (i.e.
   *  when the same link is hidden from the main nav). Lets us put
   *  the same link in both places without showing it twice. */
  narrowOnly?: boolean;
  /** Tap-handler bonus — used by anchor scrolls so the parent can
   *  close + smooth-scroll. */
  onClick?: () => void;
}

interface Props {
  items: ReadonlyArray<NavMoreItem>;
}

export function NavMore({ items }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape. One listener total, registered
  // only while the popover is open so we don't leak.
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

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition ${
          open
            ? "border-neutral-600 bg-neutral-900 text-neutral-100"
            : "border-neutral-800 bg-transparent text-neutral-400 hover:border-neutral-700 hover:text-neutral-100"
        }`}
      >
        MORE
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full mt-2 flex min-w-[220px] -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-2xl shadow-black/70"
        >
          {items.map((item) => {
            const rowClass = `flex items-center gap-2.5 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition ${
              item.muted
                ? "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
                : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
            } ${item.narrowOnly ? "xl:hidden" : ""}`;
            const handleTap = () => {
              setOpen(false);
              item.onClick?.();
            };
            return item.external ? (
              <a
                key={item.href + item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={handleTap}
                className={rowClass}
              >
                {item.glyph && (
                  <span className="text-[12px]" aria-hidden style={{ color: CORAL }}>
                    {item.glyph}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-neutral-600"
                  aria-hidden
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              </a>
            ) : (
              <Link
                key={item.href + item.label}
                href={item.href}
                role="menuitem"
                onClick={handleTap}
                className={rowClass}
              >
                {item.glyph && (
                  <span className="text-[12px]" aria-hidden>
                    {item.glyph}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

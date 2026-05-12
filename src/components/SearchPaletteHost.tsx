"use client";

// Host for the SearchPalette — owns the open/close state, the global
// hotkey listener, and the dynamic import so the palette's JS isn't
// pulled into the initial bundle until a user actually opens it.
//
// Hotkeys:
//   ⌘K / Ctrl-K  → open (works on any page)
//   /            → open, UNLESS focus is in an editable element
//   Esc          → handled inside the palette
//
// The header renders a small SEARCH button that also opens the palette,
// so users who don't know the shortcut still have a discoverable path.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SearchPalette = dynamic(
  () =>
    import("@/components/SearchPalette").then((m) => ({ default: m.SearchPalette })),
  { ssr: false },
);

function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

interface Props {
  /** Inline trigger to render in the parent layout. The host owns the open
   *  state; the parent only renders the button slot. */
  trigger: (open: () => void) => React.ReactNode;
}

export function SearchPaletteHost({ trigger }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘K / Ctrl-K — always allowed even when typing in an input, since
      // it's a deliberate command shortcut.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // `/` — Slack/Linear style. Suppressed when the user is typing in
      // an input so it doesn't hijack form fields.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {trigger(() => setOpen(true))}
      <SearchPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}

"use client";

// Canonical state-badge. Replaces 4 different ad-hoc patterns that all
// represented "what state is this thing in":
//   - Pool state (OPEN / DRAWING / RESOLVED / CLOSED) — full pill
//   - Invite state (SENT / REDEEMED) — plain text
//   - Friendship state (FRIENDS / PENDING) — rounded square
//   - Friend-request action hint — plain colored text
//
// One shape, one component, per-`kind` color + glyph token.

export type StatusKind =
  | "open"      // accepting tickets / activity in flight
  | "drawing"   // VRF reveal pending
  | "resolved"  // settled, ok
  | "closed"    // past close-time, awaiting keeper
  | "sent"      // invite issued, not yet redeemed
  | "redeemed"  // invite redeemed
  | "friends"   // accepted friendship
  | "pending"   // friend request pending
  | "you"       // self
  | "private"   // locked profile
  | "voided";   // round closed with 0 tickets

interface Token {
  label: string;
  glyph?: string;
  // Tailwind-ish triplet; we use inline style with our color vars so
  // the component doesn't depend on Tailwind utility names.
  fg: string;
  bg: string;
  border: string;
}

const TOKENS: Record<StatusKind, Token> = {
  open:     { label: "OPEN",     glyph: "▲",  fg: "var(--mint)",     bg: "rgba(136,207,196,0.16)", border: "rgba(136,207,196,0.4)" },
  drawing:  { label: "DRAWING",  glyph: "◷",  fg: "var(--sand)",     bg: "rgba(232,216,158,0.16)", border: "rgba(232,216,158,0.4)" },
  resolved: { label: "RESOLVED", glyph: "✓",  fg: "#a3a3a3",         bg: "rgba(115,115,115,0.16)", border: "rgba(115,115,115,0.4)" },
  closed:   { label: "CLOSED",   glyph: "—",  fg: "var(--sand)",     bg: "rgba(232,216,158,0.10)", border: "rgba(232,216,158,0.35)" },
  sent:     { label: "SENT",                  fg: "var(--sand)",     bg: "rgba(232,216,158,0.12)", border: "rgba(232,216,158,0.35)" },
  redeemed: { label: "REDEEMED", glyph: "✓",  fg: "var(--mint)",     bg: "rgba(136,207,196,0.12)", border: "rgba(136,207,196,0.35)" },
  friends:  { label: "FRIENDS",  glyph: "✓",  fg: "var(--mint)",     bg: "rgba(136,207,196,0.16)", border: "rgba(136,207,196,0.4)" },
  pending:  { label: "PENDING",  glyph: "↺",  fg: "var(--sand)",     bg: "rgba(232,216,158,0.16)", border: "rgba(232,216,158,0.4)" },
  you:      { label: "YOU",                   fg: "#a3a3a3",         bg: "transparent",            border: "rgba(255,255,255,0.08)" },
  private:  { label: "PRIVATE",  glyph: "🔒", fg: "#a3a3a3",         bg: "rgba(115,115,115,0.10)", border: "rgba(255,255,255,0.08)" },
  voided:   { label: "VOIDED",                fg: "#a3a3a3",         bg: "rgba(115,115,115,0.12)", border: "rgba(115,115,115,0.4)" },
};

interface Props {
  kind: StatusKind;
  /** Override the default label (e.g. show "INVITED" instead of "SENT"). */
  label?: string;
  /** Hide the leading glyph even if the kind has one. */
  hideGlyph?: boolean;
  /** Extra trailing content, rendered inside the pill (e.g. count). */
  children?: React.ReactNode;
}

export function StatusPill({ kind, label, hideGlyph, children }: Props) {
  const t = TOKENS[kind];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest"
      style={{ color: t.fg, background: t.bg, borderColor: t.border }}
    >
      {!hideGlyph && t.glyph && <span aria-hidden>{t.glyph}</span>}
      <span>{label ?? t.label}</span>
      {children}
    </span>
  );
}

# Redesign v1 (Recolored) → React Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `public/redesign-v1-recolored.html` (lavender/cream/aubergine palette + new button effects) to live React components in the Tombola Next.js app, replacing the current dark-emerald look at `/`. All existing on-chain logic (wallet connect, live pool reads, buy-ticket sign-only flow) stays wired through the new visual layer.

**Architecture:** Three-layer port. (1) Design tokens land in `src/app/globals.css` as CSS custom properties + keyframes + utility classes — production-grade replacement for the mockup's CDN Tailwind + `<style>` block. (2) Presentational components (Header, Hero, HeroRing, HeroFloatingIcons, Ticker, AllRoundsTable, WhyItsFair, BentoFooter) live under `src/components/` — server components by default, client only where user interaction or browser APIs demand. (3) `src/app/page.tsx` composes them, feeding live pool data from the existing `getLivePools` server fetcher into restyled `PoolCard` / `RecentWinners` / `StatsBar`.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind v4 · TypeScript strict ES2020 · `next/font` for Space Grotesk + Space Mono · `@solana/wallet-adapter` (existing) · `@tombola/sdk` vendored (existing) · pure CSS keyframes (no Framer Motion) · vitest + @testing-library/react for component tests.

**Source of truth:** `public/redesign-v1-recolored.html` is the visual contract. Cite it by line range when copying SVG paths, keyframes, or color values verbatim. Section boundaries:

| Section | Lines | Maps to |
|---|---|---|
| Top ticker | 326–351 | New `Ticker.tsx` |
| Nav header | 352–394 | New `Header.tsx` |
| Hero | 395–559 | New `Hero.tsx` + `HeroRing.tsx` + `HeroFloatingIcons.tsx` |
| Pool grid | 560–783 | Restyle `PoolCard.tsx` |
| Recent activity | 784–860 | Restyle `RecentWinners.tsx` |
| All rounds table | 861–933 | New `AllRoundsTable.tsx` |
| Feature cards (Why it's fair) | 934–1026 | New `WhyItsFair.tsx` |
| How it works (3-step) | 1027–1050 | Restyle `HowItWorks.tsx` |
| Bento footer | 1051–1121 | New `BentoFooter.tsx` (composes `StatsBar`) |
| Footer | 1122–end | Inline in page.tsx |
| Smooth-scroll JS | end of `<script>` | Extract to `src/lib/smooth-scroll.ts` |

---

## File Structure

**New files:**
- `src/components/Ticker.tsx` — server, SVG-free marquee
- `src/components/Header.tsx` — server, 3-col grid (logo / nav / connect)
- `src/components/Hero.tsx` — `"use client"`, hosts smooth-scroll handlers
- `src/components/HeroRing.tsx` — server, multi-layer SVG ring
- `src/components/HeroFloatingIcons.tsx` — server, 6 floating SVG icons
- `src/components/AllRoundsTable.tsx` — server, table over existing pool fetch
- `src/components/WhyItsFair.tsx` — server, 3 static cards
- `src/components/BentoFooter.tsx` — server, composes `StatsBar` + final CTA
- `src/lib/smooth-scroll.ts` — `smoothScrollTo(targetY, duration)` utility
- `src/lib/smooth-scroll.test.ts` — vitest unit
- `src/lib/pool-accent.ts` — pool-type → accent color map
- `src/lib/pool-accent.test.ts` — vitest unit

**Modified files:**
- `src/app/layout.tsx` — swap Geist for Space Grotesk + Space Mono
- `src/app/globals.css` — add tokens, keyframes, utility classes
- `src/app/page.tsx` — recompose with new components
- `src/components/ConnectWalletButton.tsx` — visual restyle (inset-fill hover + lavender chip)
- `src/components/BuyTicketButton.tsx` — ticket-tear + stack-reveal hover (logic untouched)
- `src/components/PoolCard.tsx` — new layout (pot · tickets · buyers · closes-in · progress · BUY 1 TICKET)
- `src/components/RecentWinners.tsx` — feed look from mockup lines 794–858
- `src/components/HowItWorks.tsx` — 3 numbered cards
- `src/components/StatsBar.tsx` — feed BentoFooter (or merge directly)

---

## Stage 1 — Foundation (design tokens, fonts, keyframes)

Goal: globals.css and layout.tsx are production-ready for the new palette and motion. Nothing renders differently yet because no component consumes the new tokens. This stage is a no-visual-diff refactor — we verify by running `npm run build` clean.

### Task 1.1: Add CSS custom properties to globals.css

**Files:**
- Modify: `src/app/globals.css` — append after the existing `@theme inline` block

- [ ] **Step 1: Read source from mockup**

Read `public/redesign-v1-recolored.html` lines 14–94 to confirm the exact tokens. Key values:
- `--bg: #17171b` (darker than current neutral-950)
- `--bg-elevated: #1f1f24`
- `--bg-warm: #1c1a16`
- `--lime: #c9b5dc` (the var name says lime — value is **lavender**; we keep both names below to make intent clear and ease later refactor)
- Background = 5 stacked radial-gradients (top-left lavender, top-right lavender-2, bottom-left peach, bottom-right sky, center cool wash) over `--bg`

- [ ] **Step 2: Append tokens to globals.css**

Open `src/app/globals.css`. After the `@theme inline { ... }` block, append:

```css
:root {
  /* Surface tokens */
  --bg: #17171b;
  --bg-elevated: #1f1f24;
  --bg-warm: #1c1a16;
  --ink: #f5f5f5;
  --line: rgba(255, 255, 255, 0.08);

  /* Accent palette (no lime — see chat1.md design history) */
  --lavender: #c9b5dc;
  --lavender-dim: #c9b5dc33;
  --mint: #88cfc4;
  --yellow: #e8d89e;
  --pink: #e8a5c0;

  /* Aliases (prototype calls lavender "lime" — keep the alias so direct
     copy-paste from public/redesign-v1-recolored.html keeps working
     while we migrate. Kill these aliases after Stage 6.) */
  --lime: var(--lavender);
  --lime-dim: var(--lavender-dim);
}

html,
body {
  background:
    radial-gradient(35% 30% at 12% 18%, rgba(201, 181, 220, 0.12) 0%, transparent 70%),
    radial-gradient(35% 30% at 88% 22%, rgba(184, 165, 212, 0.12) 0%, transparent 70%),
    radial-gradient(35% 30% at 8%  72%, rgba(232, 216, 158, 0.12) 0%, transparent 70%),
    radial-gradient(35% 30% at 92% 78%, rgba(136, 207, 196, 0.12) 0%, transparent 70%),
    radial-gradient(60% 50% at 50% 35%, #232328 0%, transparent 60%),
    var(--bg);
  background-attachment: fixed;
  color: var(--ink);
  font-feature-settings: "ss01", "ss02";
}

.font-display {
  font-family: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.font-mono {
  font-family: var(--font-space-mono), ui-monospace, monospace;
}
```

- [ ] **Step 3: Run build to verify no syntax errors**

Run: `npm run build`
Expected: build succeeds, output ends with `Compiled successfully`. Body bg may briefly look identical to the existing dark theme — that's correct because the radial gradients are subtle and `<body>` already has Tailwind's `bg-neutral-950` overriding (we'll remove that in Task 1.2).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add lavender/cream tokens + multi-zone bg gradient"
```

---

### Task 1.2: Wire Space Grotesk + Space Mono via next/font

**Files:**
- Modify: `src/app/layout.tsx:1–35` (replace Geist with Space Grotesk + Space Mono)

- [ ] **Step 1: Replace font imports in layout.tsx**

Open `src/app/layout.tsx`. Replace the top of the file (the imports + font declarations + the `<body className=...>` line):

```tsx
import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});
```

Then in the `<body>` className, swap `${geistSans.variable} ${geistMono.variable}` to `${spaceGrotesk.variable} ${spaceMono.variable}` and **remove** `bg-neutral-950 text-neutral-100` so the new globals.css gradient/ink colors win:

```tsx
<body
  className={`${spaceGrotesk.variable} ${spaceMono.variable} font-display antialiased min-h-screen`}
>
```

- [ ] **Step 2: Update globals.css `@theme inline` to point at new font vars**

Open `src/app/globals.css` lines 11–14. Replace:

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

with:

```css
@theme inline {
  --font-sans: var(--font-space-grotesk);
  --font-mono: var(--font-space-mono);
}
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: success. Page text now renders in Space Grotesk (visually similar to Geist but slightly more geometric — confirm by previewing http://localhost:3000/ if dev server still running).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(design): swap Geist for Space Grotesk + Space Mono via next/font"
```

---

### Task 1.3: Port keyframes to globals.css

**Files:**
- Modify: `src/app/globals.css` — append after the `:root` and `body` blocks from Task 1.1

Source: mockup lines 105–178 (keyframes) + lines 138–178 (float-a..f).

- [ ] **Step 1: Append all keyframes**

Append to `src/app/globals.css`:

```css
/* === Animation keyframes (ported from public/redesign-v1-recolored.html) === */

/* Hero rotating ring — 4 layers spinning at different speeds */
@keyframes spin-slow    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spin-counter { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes spin-fast    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.spin-slow    { animation: spin-slow 50s linear infinite; transform-origin: center; }
.spin-counter { animation: spin-counter 35s linear infinite; transform-origin: center; }
.spin-fast    { animation: spin-fast 20s linear infinite; transform-origin: center; }

/* Orbital tickets (test1 variant — keep available even if unused on v1) */
@keyframes orbit-tickets { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.orbit-tickets { animation: orbit-tickets 72s linear infinite; transform-origin: center; }

/* Ticker marquee */
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.ticker-track { animation: ticker 60s linear infinite; width: max-content; }

/* Pulse — used by the "LIVE" indicator dot */
@keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }

/* Section :target highlight pulse */
@keyframes target-pulse {
  0%   { box-shadow: 0 0 0 0    rgba(201, 181, 220, 0); }
  25%  { box-shadow: 0 0 0 8px  rgba(201, 181, 220, 0.18); }
  100% { box-shadow: 0 0 0 0    rgba(201, 181, 220, 0); }
}
section[id] { scroll-margin-top: 32px; }
section[id]:target { border-radius: 24px; animation: target-pulse 1.6s ease-out 1; }

/* Hero floating icons — 6 unique 3-keyframe loops */
@keyframes float-a {
  0%, 100% { transform: translateY(0)    rotate(0deg)  scale(1); }
  33%      { transform: translateY(-38px) rotate(8deg)  scale(1.08); }
  66%      { transform: translateY(20px)  rotate(-5deg) scale(0.96); }
}
@keyframes float-b {
  0%, 100% { transform: translateY(0)    rotate(0deg)  scale(1); }
  33%      { transform: translateY(28px)  rotate(-12deg) scale(0.94); }
  66%      { transform: translateY(-22px) rotate(7deg)  scale(1.06); }
}
@keyframes float-c {
  0%, 100% { transform: translateY(0)    rotate(0deg)  scale(1); }
  33%      { transform: translateY(-30px) rotate(-9deg) scale(1.05); }
  66%      { transform: translateY(35px)  rotate(11deg) scale(0.95); }
}
@keyframes float-d {
  0%, 100% { transform: translateY(0)    rotate(0deg)   scale(1); }
  33%      { transform: translateY(32px)  rotate(13deg)  scale(0.93); }
  66%      { transform: translateY(-25px) rotate(-8deg)  scale(1.07); }
}
@keyframes float-e {
  0%, 100% { transform: translateY(0)    rotate(0deg)  scale(1); }
  33%      { transform: translateY(-25px) rotate(15deg)  scale(1.04); }
  66%      { transform: translateY(30px)  rotate(-10deg) scale(0.97); }
}
@keyframes float-f {
  0%, 100% { transform: translateY(0)    rotate(0deg)  scale(1); }
  33%      { transform: translateY(28px)  rotate(-14deg) scale(1.05); }
  66%      { transform: translateY(-30px) rotate(9deg)   scale(0.95); }
}
.float-a { animation: float-a 11s ease-in-out infinite; }
.float-b { animation: float-b 13s ease-in-out infinite; }
.float-c { animation: float-c 9s  ease-in-out infinite; }
.float-d { animation: float-d 14s ease-in-out infinite; }
.float-e { animation: float-e 10s ease-in-out infinite; }
.float-f { animation: float-f 12s ease-in-out infinite; }

/* Subtle dot grid — used as a hero background hatch */
.bg-dots {
  background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}
```

- [ ] **Step 2: Build verifies no CSS errors**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): port keyframes (spin/float/ticker/pulse/target)"
```

---

### Task 1.4: Port utility classes (.nav-link + button effects)

**Files:**
- Modify: `src/app/globals.css` — append after keyframes from Task 1.3

Source: mockup lines 22–58 (.nav-link), 195–325 (button effects: inset-fill, stack-reveal, ticket-tear).

- [ ] **Step 1: Append .nav-link rule**

```css
/* === .nav-link — pill hover + lavender underline sweep === */
.nav-link {
  position: relative;
  display: inline-block;
  padding: 0.5rem 0.85rem;
  font-family: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #a3a3a3;
  border-radius: 9999px;
  transition: color 0.2s ease, background-color 0.25s ease;
}
.nav-link::after {
  content: "";
  position: absolute;
  left: 0.85rem;
  right: 0.85rem;
  bottom: 0.25rem;
  height: 1.5px;
  background: var(--lavender);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.nav-link:hover { color: #fff; background-color: rgba(255, 255, 255, 0.04); }
.nav-link:hover::after { transform: scaleX(1); }
.nav-link:active { background-color: rgba(201, 181, 220, 0.08); color: var(--lavender); }
```

- [ ] **Step 2: Append button-effect classes**

Inline-copy from mockup lines 195–325. Append:

```css
/* === Button effects (inset-fill, stack-reveal, ticket-tear) === */

/* INSET FILL — dark wash slides in from left, label flips white */
.btn-inset {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: linear-gradient(to right, var(--ink) 50%, var(--bg) 50%);
  background-size: 200% 100%;
  background-position: 0% 0;
  transition: background-position 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.3s ease;
  color: var(--bg);
}
.btn-inset:hover {
  background-position: -100% 0;
  color: var(--ink);
}
.btn-inset .chip {
  transition: background-color 0.3s ease, color 0.3s ease;
}
.btn-inset:hover .chip {
  background-color: var(--lavender);
  color: var(--bg);
}

/* STACK REVEAL — vertical viewport with two stacked labels */
.btn-stack {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 1.25rem;
  overflow: hidden;
  vertical-align: middle;
}
.btn-stack > .stack {
  display: flex;
  flex-direction: column;
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.btn-stack > .stack > span {
  display: block;
  height: 1.25rem;
  line-height: 1.25rem;
  white-space: nowrap;
}
.btn-parent:hover .btn-stack > .stack { transform: translateY(-1.25rem); }

/* TICKET TEAR — notched corners via clip-path on ::before bg layer
   (chat1.md says: keep clip-path off the button itself so subpixel
   AA on the label survives) */
.btn-tear {
  position: relative;
  isolation: isolate;
  background: transparent;
}
.btn-tear::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--lavender);
  clip-path: polygon(
    8px 0, calc(100% - 8px) 0,
    100% 8px, 100% calc(100% - 8px),
    calc(100% - 8px) 100%, 8px 100%,
    0 calc(100% - 8px), 0 8px
  );
  z-index: -1;
  transition: background-color 0.3s ease;
}
.btn-tear:hover::before { background: var(--ink); }
.btn-tear { color: var(--bg); transition: color 0.3s ease; }
.btn-tear:hover { color: var(--lavender); }

/* Block-tear variant — bigger notch radius for the final CTA card */
.btn-tear-block::before {
  clip-path: polygon(
    14px 0, calc(100% - 14px) 0,
    100% 14px, 100% calc(100% - 14px),
    calc(100% - 14px) 100%, 14px 100%,
    0 calc(100% - 14px), 0 14px
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): port .nav-link + button effects (inset-fill, stack, tear)"
```

---

### Task 1.5: Foundation smoke check

- [ ] **Step 1: Spin up dev server**

Run: `npm run dev` (or use the running preview server)
Open http://localhost:3000/

- [ ] **Step 2: Visual gut check**

Confirm the existing dark-emerald page renders identically to before (no visual regression). The only material change should be subtler — fonts have shifted from Geist → Space Grotesk; barely perceptible.

- [ ] **Step 3: Tests still pass**

Run: `npm test`
Expected: all 47 tests pass.

---

## Stage 2 — Header + Hero (the big visual swap)

Goal: at the end of Stage 2, http://localhost:3000/ shows the recolored mockup's ticker + nav + hero, with a working CONNECT button (real wallet adapter), nav links smooth-scrolling to anchors, and the BUY A TICKET CTA scrolling to `#pools`. The body of the page below the hero stays as the current dark-emerald layout — it gets restyled in Stages 3+.

### Task 2.1: Smooth-scroll utility

**Files:**
- Create: `src/lib/smooth-scroll.ts`
- Test: `src/lib/smooth-scroll.test.ts`

Source: mockup `<script>` block at end of file — copy the easeInOutCubic + 1100ms duration.

- [ ] **Step 1: Write the failing test**

Create `src/lib/smooth-scroll.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { smoothScrollTo, easeInOutCubic } from "./smooth-scroll";

describe("easeInOutCubic", () => {
  it("returns 0 at t=0 and 1 at t=1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
  it("returns 0.5 at t=0.5 (symmetric)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("smoothScrollTo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true });
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn((opts: { top: number }) => {
        (window as unknown as { scrollY: number }).scrollY = opts.top;
      }),
      writable: true,
    });
  });

  it("calls scrollTo at least once and ends at the target", () => {
    smoothScrollTo(500, 100);
    vi.advanceTimersByTime(150);
    const calls = (window.scrollTo as unknown as { mock: { calls: { 0: { top: number } }[] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0].top).toBeCloseTo(500, 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test smooth-scroll`
Expected: FAIL with "Cannot find module './smooth-scroll'".

- [ ] **Step 3: Implement smooth-scroll.ts**

Create `src/lib/smooth-scroll.ts`:

```ts
/**
 * Cubic ease-in-out — matches public/redesign-v1-recolored.html's
 * scroll JS exactly. Defined as a pure function so we can unit-test
 * the curve (no DOM needed).
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smoothly scrolls window.scrollY to `targetY` over `duration` ms using
 * easeInOutCubic. The browser's CSS `scroll-behavior: smooth` is too
 * fast (~400 ms) and exposes no duration knob; this rolls our own.
 *
 * Calls `window.scrollTo({ top })` on each rAF tick. No-ops in SSR
 * (typeof window === "undefined").
 */
export function smoothScrollTo(targetY: number, duration = 1100): void {
  if (typeof window === "undefined") return;
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now: number): void {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(t);
    window.scrollTo({ top: startY + distance * eased });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Scrolls to a section by id, with a 32px breathing offset.
 * Used by Hero + Header nav onClick handlers.
 */
export function smoothScrollToId(id: string, duration = 1100): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const targetY = el.getBoundingClientRect().top + window.scrollY - 32;
  smoothScrollTo(targetY, duration);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm test smooth-scroll`
Expected: PASS, both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/smooth-scroll.ts src/lib/smooth-scroll.test.ts
git commit -m "feat(scroll): smoothScrollTo + smoothScrollToId utility (easeInOutCubic, 1100ms)"
```

---

### Task 2.2: Pool accent map

**Files:**
- Create: `src/lib/pool-accent.ts`
- Test: `src/lib/pool-accent.test.ts`

- [ ] **Step 1: Failing test**

Create `src/lib/pool-accent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { accentForPool } from "./pool-accent";

describe("accentForPool", () => {
  it("maps each pool type to a distinct CSS var", () => {
    expect(accentForPool("Weekly")).toBe("var(--lavender)");
    expect(accentForPool("Biweekly")).toBe("var(--mint)");
    expect(accentForPool("Triweekly")).toBe("var(--yellow)");
    expect(accentForPool("Monthly")).toBe("var(--pink)");
  });
  it("falls back to lavender for unknown types", () => {
    expect(accentForPool("Unknown")).toBe("var(--lavender)");
  });
});
```

- [ ] **Step 2: Run test to fail**

Run: `npm test pool-accent`
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement**

Create `src/lib/pool-accent.ts`:

```ts
import type { PoolView } from "@/lib/mock-pools";

/**
 * Maps a pool type label to the CSS custom property used as its
 * accent color across cards / tickers / progress bars / buttons.
 * Keep the mapping in one place so a palette swap is a one-line change.
 */
export function accentForPool(label: PoolView["typeLabel"] | string): string {
  switch (label) {
    case "Weekly":    return "var(--lavender)";
    case "Biweekly":  return "var(--mint)";
    case "Triweekly": return "var(--yellow)";
    case "Monthly":   return "var(--pink)";
    default:          return "var(--lavender)";
  }
}
```

- [ ] **Step 4: Test pass**

Run: `npm test pool-accent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pool-accent.ts src/lib/pool-accent.test.ts
git commit -m "feat(design): per-pool accent color map"
```

---

### Task 2.3: Ticker component

**Files:**
- Create: `src/components/Ticker.tsx`

Source: mockup lines 326–351.

- [ ] **Step 1: Implement Ticker.tsx**

Create `src/components/Ticker.tsx`:

```tsx
/**
 * Top-of-page marquee. Server component — content is static for now;
 * a future task may wire it to LivePoolWatcher events.
 *
 * The marquee technique: a horizontal flex of items, duplicated once,
 * inside a `width: max-content` container animated with `translateX(-50%)`
 * over 60s. The duplicate makes the loop seamless.
 */
type TickerEvent = {
  readonly tag: string;     // e.g. "BOUGHT 5"
  readonly type: string;    // e.g. "WEEKLY"
  readonly age: string;     // e.g. "12s"
  readonly accent?: string; // CSS color
};

const EVENTS: readonly TickerEvent[] = [
  { tag: "BOUGHT 5",  type: "WEEKLY",    age: "12s", accent: "var(--lavender)" },
  { tag: "BOUGHT 20", type: "BIWEEKLY",  age: "47s", accent: "var(--mint)" },
  { tag: "BOUGHT 1",  type: "TRIWEEKLY", age: "1m",  accent: "var(--yellow)" },
  { tag: "BOUGHT 3",  type: "WEEKLY",    age: "2m",  accent: "var(--lavender)" },
  { tag: "WON 10.18 SOL", type: "MONTHLY",  age: "#2",  accent: "var(--pink)" },
  { tag: "BOUGHT 50", type: "WEEKLY",    age: "4m",  accent: "var(--lavender)" },
];

function Item({ ev }: { ev: TickerEvent }) {
  return (
    <span className="inline-flex items-center gap-3 px-6 text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-mono">
      <span
        className="size-1.5 rounded-full"
        style={{ background: ev.accent ?? "var(--lavender)" }}
        aria-hidden
      />
      <span className="text-white">{ev.tag}</span>
      <span>·</span>
      <span>{ev.type}</span>
      <span>·</span>
      <span className="text-neutral-500">{ev.age}</span>
    </span>
  );
}

export function Ticker() {
  // Duplicate the list so the keyframe `translateX(-50%)` loops cleanly
  const doubled = [...EVENTS, ...EVENTS];
  return (
    <div className="overflow-hidden border-b border-white/5 bg-black/30 backdrop-blur">
      <div className="ticker-track flex py-2">
        {doubled.map((ev, i) => (
          <Item key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/Ticker.tsx
git commit -m "feat(ticker): top-of-page marquee with mock events"
```

---

### Task 2.4: HeroRing SVG component

**Files:**
- Create: `src/components/HeroRing.tsx`

Source: mockup lines ~471–530 (the SVG block inside the hero — it spans 4 nested `<g>` layers each on a `.spin-*` class).

- [ ] **Step 1: Implement HeroRing**

Create `src/components/HeroRing.tsx`:

```tsx
/**
 * Multi-layer rotating ring centered behind the hero headline.
 * Four `<g>` layers each spin at a different speed:
 *   - .spin-slow    50s — outermost dotted band
 *   - .spin-counter 35s — counter-spinning thin arc with comet
 *   - .spin-fast    20s — comet head (single bright dash)
 *   - static        — hairlines that anchor the eye
 *
 * Server component — pure SVG + className-driven CSS animation,
 * no React state.
 *
 * Sized via the `size` prop (px). Mockup uses ~520 on desktop, ~360
 * on mobile (controlled by Tailwind responsive class on the parent).
 */
export function HeroRing({ size = 520 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute inset-0 mx-auto"
      aria-hidden
    >
      {/* Static outer hairline */}
      <circle cx={cx} cy={cy} r={cx - 6}  fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Static inner hairline */}
      <circle cx={cx} cy={cy} r={cx - 24} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* Dashed counter-spin band — sits between the hairlines */}
      <g className="spin-counter" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle
          cx={cx} cy={cy} r={cx - 14}
          fill="none"
          stroke="rgba(201,181,220,0.4)"
          strokeWidth="1.5"
          strokeDasharray="2 8"
        />
      </g>

      {/* Slow forward spin — single bright comet dash */}
      <g className="spin-slow" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle
          cx={cx} cy={cy} r={cx - 14}
          fill="none"
          stroke="var(--lavender)"
          strokeWidth="2"
          strokeDasharray={`${size * 0.04} ${size * 5}`}
          strokeLinecap="round"
        />
      </g>

      {/* Fast forward spin — small accent dot orbiting */}
      <g className="spin-fast" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={6 + 14} r="3" fill="var(--mint)" />
      </g>

      {/* 4 pool pips at compass points (no rotation) */}
      <circle cx={cx} cy={cy - (cx - 14)} r="2.5" fill="var(--lavender)" />
      <circle cx={cx + (cx - 14)} cy={cy} r="2.5" fill="var(--mint)" />
      <circle cx={cx} cy={cy + (cx - 14)} r="2.5" fill="var(--yellow)" />
      <circle cx={cx - (cx - 14)} cy={cy} r="2.5" fill="var(--pink)" />
    </svg>
  );
}
```

Note: the mockup has slightly different geometry — read lines ~471–530 of `public/redesign-v1-recolored.html` and update the radii / stroke-widths to match exactly if visual diff is off. The structure above is a faithful skeleton.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/HeroRing.tsx
git commit -m "feat(hero): rotating multi-layer ring SVG (4 speeds, lavender accent)"
```

---

### Task 2.5: HeroFloatingIcons component

**Files:**
- Create: `src/components/HeroFloatingIcons.tsx`

Source: mockup lines 401–478 — six absolute-positioned SVGs each on `.float-a`–`.float-f`.

- [ ] **Step 1: Implement HeroFloatingIcons**

Create `src/components/HeroFloatingIcons.tsx`:

```tsx
/**
 * Six floating SVG icons positioned around the hero ring on lg+ screens.
 * Each icon has its own `.float-a..f` keyframe (different timings +
 * amplitudes) so the cluster feels alive without obvious sync.
 *
 * Hidden below `lg` (mockup pattern — they crowd small screens).
 *
 * Hand-tuned positions (Tailwind absolute), translated from
 * public/redesign-v1-recolored.html lines 401–478.
 */
type FloatingIconProps = {
  position: string;          // tailwind absolute classes
  animation: "a" | "b" | "c" | "d" | "e" | "f";
  children: React.ReactNode;
  bgClass?: string;
};

function FloatingIcon({ position, animation, children, bgClass = "bg-[#1f1f24]" }: FloatingIconProps) {
  return (
    <div
      className={`hidden lg:flex absolute ${position} float-${animation} h-14 w-14 items-center justify-center rounded-2xl ${bgClass} ring-1 ring-white/10 shadow-xl shadow-black/40`}
    >
      {children}
    </div>
  );
}

export function HeroFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* LEFT cluster */}
      <FloatingIcon position="left-[8%] top-[18%]" animation="a">
        {/* Ticket icon */}
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--lavender)" }}>
          <rect x="6" y="12" width="28" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="12" x2="20" y2="28" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" />
          <text x="13" y="24" fontSize="7" fontFamily="monospace" fill="currentColor">047</text>
        </svg>
      </FloatingIcon>

      <FloatingIcon position="left-[6%] top-[48%]" animation="b">
        {/* Dice icon */}
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--mint)" }}>
          <rect x="8" y="8" width="24" height="24" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="14" cy="14" r="1.6" fill="currentColor" />
          <circle cx="20" cy="20" r="1.6" fill="currentColor" />
          <circle cx="26" cy="26" r="1.6" fill="currentColor" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="left-[4%] top-[78%]" animation="c">
        {/* Sparkle */}
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--yellow)" }}>
          <path d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" fill="currentColor" />
        </svg>
      </FloatingIcon>

      {/* RIGHT cluster */}
      <FloatingIcon position="right-[8%] top-[18%]" animation="d">
        {/* Solana logo (3 angled bars) */}
        <svg viewBox="0 0 40 40" className="h-7 w-7">
          <path d="M9 12 L29 12 L33 16 L13 16 Z" fill="var(--lavender)" />
          <path d="M9 18 L29 18 L33 22 L13 22 Z" fill="var(--mint)" />
          <path d="M9 24 L29 24 L33 28 L13 28 Z" fill="var(--pink)" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="right-[6%] top-[48%]" animation="e">
        {/* Trophy */}
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--lavender)" }}>
          <path d="M14 8 H26 V18 a6 6 0 0 1 -12 0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="24" x2="20" y2="30" stroke="currentColor" strokeWidth="2" />
          <line x1="14" y1="32" x2="26" y2="32" stroke="currentColor" strokeWidth="2" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="right-[4%] top-[78%]" animation="f">
        {/* Confetti burst */}
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--pink)" }}>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <line
              key={deg}
              x1="20" y1="20" x2="20" y2="8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${deg} 20 20)`}
            />
          ))}
          <circle cx="20" cy="20" r="3" fill="currentColor" />
        </svg>
      </FloatingIcon>
    </div>
  );
}
```

Tweak positions to match the mockup exactly by eye after preview.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/HeroFloatingIcons.tsx
git commit -m "feat(hero): 6 floating icons with float-a..f animations"
```

---

### Task 2.6: Hero composition

**Files:**
- Create: `src/components/Hero.tsx`

- [ ] **Step 1: Implement Hero.tsx**

Create `src/components/Hero.tsx`:

```tsx
"use client";

import { HeroRing } from "@/components/HeroRing";
import { HeroFloatingIcons } from "@/components/HeroFloatingIcons";
import { smoothScrollToId } from "@/lib/smooth-scroll";

/**
 * Page-top hero. `"use client"` so the BUY A TICKET / LEARN MORE
 * onClick handlers can do animated scroll. The static SVG children
 * (HeroRing, HeroFloatingIcons) are server components — only Hero
 * itself needs to be client.
 */
export function Hero() {
  function handleScrollTo(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      smoothScrollToId(id);
    };
  }

  return (
    <section className="relative mx-auto max-w-7xl overflow-hidden px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="bg-dots absolute inset-0 -z-10 opacity-40" />
      <HeroFloatingIcons />

      {/* Centered ring + content */}
      <div className="relative mx-auto flex aspect-square max-w-[520px] items-center justify-center">
        <HeroRing size={520} />

        <div className="relative z-10 text-center">
          {/* LIVE pill */}
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] ring-1 ring-white/10">
            <span className="size-1.5 rounded-full bg-emerald-400 pulse-soft" aria-hidden />
            <span className="text-white">LIVE</span>
            <span className="text-neutral-500">·</span>
            <span className="text-neutral-300">4 POOLS RUNNING</span>
          </div>

          <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl md:text-7xl">
            WHERE SOL <br /> WINS BIG.
          </h1>

          <p className="mx-auto mt-6 max-w-md text-sm text-neutral-400">
            Trustless on-chain raffles. Buy tickets, win the pot, repeat — verifiable randomness via Switchboard.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <a
              href="#how-it-works"
              onClick={handleScrollTo("how-it-works")}
              className="btn-parent group inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold uppercase tracking-[0.12em] btn-inset"
            >
              <span className="btn-stack">
                <span className="stack">
                  <span>LEARN MORE</span>
                  <span>SCROLL ↓</span>
                </span>
              </span>
              <span className="chip flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white">→</span>
            </a>

            <a
              href="#pools"
              onClick={handleScrollTo("pools")}
              className="btn-parent group inline-flex h-11 items-center gap-2 rounded-full px-5 text-[12px] font-semibold uppercase tracking-[0.12em] btn-tear"
            >
              <span className="btn-stack">
                <span className="stack">
                  <span>BUY A TICKET</span>
                  <span>LET'S GO →</span>
                </span>
              </span>
              <span className="chip flex size-7 items-center justify-center rounded-full bg-black text-white">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/Hero.tsx
git commit -m "feat(hero): composition with smooth-scroll CTAs (LEARN MORE / BUY A TICKET)"
```

---

### Task 2.7: Header component

**Files:**
- Create: `src/components/Header.tsx`

- [ ] **Step 1: Implement Header.tsx**

Create `src/components/Header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkPill } from "@/components/NetworkPill";
import { smoothScrollToId } from "@/lib/smooth-scroll";

/**
 * Three-column nav grid (mockup pattern):
 *   left:   logo
 *   center: nav links (justify-self-center keeps them on the page axis)
 *   right:  network pill + CONNECT button
 *
 * Client component — onClick handlers wire nav links to smoothScrollToId.
 */
const NAV_ITEMS = [
  { id: "pools",         label: "POOLS" },
  { id: "how-it-works",  label: "HOW IT WORKS" },
  { id: "stats",         label: "STATS" },
  { id: "faq",           label: "FAQ" },
] as const;

export function Header({ cluster }: { cluster: string }) {
  function handleScroll(id: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      smoothScrollToId(id);
    };
  }

  return (
    <header className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-5">
      {/* LEFT: logo */}
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

      {/* CENTER: nav links */}
      <nav className="hidden items-center gap-1 justify-self-center sm:flex">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={handleScroll(item.id)}
            className="nav-link"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* RIGHT: status + CTA */}
      <div className="flex items-center gap-3 justify-self-end">
        <NetworkPill cluster={cluster} />
        <ConnectWalletButton />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat(header): 3-col grid with nav-link smooth-scroll + ConnectWalletButton"
```

---

### Task 2.8: Restyle ConnectWalletButton

**Files:**
- Modify: `src/components/ConnectWalletButton.tsx`

- [ ] **Step 1: Update inline styles**

Open `src/components/ConnectWalletButton.tsx`. Replace the entire `<WalletMultiButton style={{...}} />` JSX with:

```tsx
return (
  <div className="btn-parent">
    <WalletMultiButton
      style={{
        backgroundColor: "var(--ink)",
        color: "var(--bg)",
        borderRadius: "9999px",
        height: "2.5rem",
        fontSize: "12px",
        fontFamily: "inherit",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        padding: "0 0.5rem 0 1rem",
        border: "none",
        lineHeight: "1.25rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    />
  </div>
);
```

(The wallet-adapter renders its own children; the visual restyle is via inline `style` since wallet-adapter doesn't accept className. The `.btn-parent` wrapper enables `:hover` parents-of-stack effects later if wanted.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/ConnectWalletButton.tsx
git commit -m "style(wallet): cream pill with uppercase label (matches mockup CONNECT button)"
```

---

### Task 2.9: Compose new Header + Hero into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add new imports + render Ticker/Header/Hero at top**

Open `src/app/page.tsx`. After the existing imports, add:

```tsx
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { Header } from "@/components/Header";
```

Find the existing `<header>` JSX block (the page currently has an inline header — replace it). The new top of the rendered tree should be:

```tsx
return (
  <>
    <Ticker />
    <Header cluster={CLUSTER} />
    <Hero />
    {/* ...rest of the page (existing pools / faq / footer) stays unchanged for now... */}
  </>
);
```

- [ ] **Step 2: Add section IDs to existing blocks**

For the existing pool grid wrapper, add `id="pools"`. For the existing HowItWorks, wrap it in `<section id="how-it-works">`. For stats (StatsBar / charts area) wrap in `<section id="stats">`. For FAQ, ensure `<FaqSection />` is wrapped in `<section id="faq">` (or pass `id` if it already accepts one — read the FaqSection.tsx file before deciding).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. The hero shows up; the rest of the page below uses the old visual style — that's expected, restyles in Stage 3+.

- [ ] **Step 4: Visual smoke test**

Run dev server. Open http://localhost:3000/. Confirm:
- Top ticker visible
- New header with logo + 4 centered nav links + LOCALNET pill + lavender CONNECT button
- Hero with rotating ring + 6 floating icons + LIVE pill + "WHERE SOL WINS BIG." headline + LEARN MORE + BUY A TICKET buttons
- Click LEARN MORE → smooth-scrolls to "How it works" section (current dark-emerald style)
- Click BUY A TICKET → smooth-scrolls to pools section (current dark-emerald style)
- Click POOLS / HOW IT WORKS / STATS / FAQ in nav → each smooth-scrolls to its anchor

- [ ] **Step 5: Tests still green**

Run: `npm test`
Expected: all pre-existing tests pass + new smooth-scroll + pool-accent tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(layout): swap hero + header for recolored mockup (lavender)"
```

---

## Stage 3 — Public Pools restyle

Goal: pool cards match the mockup's data-dense layout (POT headline / 4-stat row / progress bar / BUY 1 TICKET in pool's accent color), and BUY 1 TICKET has the ticket-tear + stack-reveal hover.

### Task 3.1: Restyle PoolCard

**Files:**
- Modify: `src/components/PoolCard.tsx`

Source: mockup lines 565–780 — each pool card.

- [ ] **Step 1: Read existing PoolCard to preserve all data hooks**

Open `src/components/PoolCard.tsx`. Note the props it accepts (likely a `pool: PoolView`) and which data fields it shows: pot, tickets, buyers, closes-in, progress %, state. Don't change the props — only the visual structure.

- [ ] **Step 2: Replace render body with mockup layout**

Replace the JSX return body (keep the imports + types + props):

```tsx
import { accentForPool } from "@/lib/pool-accent";
import { BuyTicketButton } from "@/components/BuyTicketButton";
// ...existing imports preserved

export function PoolCard({ pool }: { pool: PoolView }) {
  const accent = accentForPool(pool.typeLabel);
  const isOpen = pool.state === "Open";
  const ticketsSoldPct = Math.min(100, Math.round((pool.ticketsSold / pool.targetTickets) * 100));

  return (
    <article className="rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5 p-6 shadow-xl shadow-black/30">
      {/* Header row: pool name + state pill */}
      <header className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-3xl uppercase tracking-tight">{pool.typeLabel}</h3>
          <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
            ROUND #{pool.roundIndex.toString()} · <a href={pool.explorerUrl} target="_blank" rel="noreferrer" className="hover:text-white">EXPLORER ↗</a>
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.18em] ring-1 ring-white/10 ${isOpen ? "" : "bg-white/5"}`}
          style={isOpen ? { color: accent } : undefined}
        >
          <span className="size-1.5 rounded-full" style={{ background: isOpen ? accent : "rgb(115 115 115)" }} aria-hidden />
          {pool.state}
        </span>
      </header>

      {/* POT headline */}
      <div className="mt-6">
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">POT</p>
        <p className="font-display text-5xl tabular-nums">
          {pool.potSol.toFixed(2)} <span className="text-base text-neutral-400">SOL</span>
        </p>
      </div>

      {/* 3-stat row */}
      <dl className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="TICKETS" value={pool.ticketsSold.toString()} />
        <Stat label="BUYERS"  value={pool.uniqueBuyers.toString()} />
        <Stat label="CLOSES IN" value={pool.closesIn} />
      </dl>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
          <span>TICKETS SOLD</span>
          <span>{ticketsSoldPct}% OF TYPICAL ROUND</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${ticketsSoldPct}%`, background: accent }} />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-6">
        {isOpen ? (
          <BuyTicketButton pool={pool} accentColor={accent} />
        ) : (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/[0.03] py-3 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-400">
            ROUND CLOSED · DRAWING
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">{label}</dt>
      <dd className="mt-1 font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}
```

Adjust if `PoolView` field names differ — read `src/lib/mock-pools.ts` first to confirm.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. (TypeScript may complain if PoolView fields don't match — fix by adjusting field names to match mock-pools.ts.)

- [ ] **Step 4: Visual check + tests**

Run dev server, scroll to pools section. All 4 cards should render with the new layout.
Run `npm test` — verify any PoolCard tests still pass (update test snapshots if any).

- [ ] **Step 5: Commit**

```bash
git add src/components/PoolCard.tsx
git commit -m "feat(pool-card): mockup layout — pot headline + 3-stat + progress + accent"
```

---

### Task 3.2: Add ticket-tear to BuyTicketButton

**Files:**
- Modify: `src/components/BuyTicketButton.tsx`

- [ ] **Step 1: Add accentColor prop + apply btn-tear**

Open `src/components/BuyTicketButton.tsx`. The component currently exposes a button; add an `accentColor?: string` prop and apply `.btn-tear` + an inline `--lavender` override so the clip-path uses the pool's accent:

```tsx
type Props = {
  pool: PoolView;
  accentColor?: string;
};

export function BuyTicketButton({ pool, accentColor = "var(--lavender)" }: Props) {
  // ...existing wallet/sign/send logic UNCHANGED

  return (
    <button
      onClick={handleBuy}
      disabled={disabled}
      className="btn-parent btn-tear inline-flex w-full h-12 items-center justify-center gap-3 rounded-none text-[12px] font-semibold uppercase tracking-[0.12em]"
      style={{ ["--lavender" as any]: accentColor }}
    >
      <span className="btn-stack">
        <span className="stack">
          <span>BUY 1 TICKET · {(pool.ticketPriceSol).toFixed(2)} SOL</span>
          <span>LET'S GO →</span>
        </span>
      </span>
    </button>
  );
}
```

The CSS-var override (`style={{ "--lavender": accentColor }}`) makes `.btn-tear::before { background: var(--lavender) }` resolve to the pool's color without needing per-pool CSS classes.

- [ ] **Step 2: Build + run existing BuyTicketButton tests**

Run: `npm run build && npm test BuyTicketButton`
Expected: build success; all tests pass (logic untouched).

- [ ] **Step 3: Commit**

```bash
git add src/components/BuyTicketButton.tsx
git commit -m "style(buy): ticket-tear + stack-reveal hover (logic untouched)"
```

---

### Task 3.3: 2-col PoolGrid layout in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Wrap pool cards in a 2-col grid**

Find the section where pool cards are rendered (currently a vertical stack or single grid). Replace with:

```tsx
<section id="pools" className="mx-auto max-w-7xl px-6 pb-20">
  <header className="mb-8">
    <h2 className="font-display text-5xl uppercase tracking-tight">PUBLIC POOLS</h2>
    <p className="mt-2 text-sm text-neutral-400 font-mono uppercase tracking-[0.18em]">
      {pools.length} ROUNDS RUNNING IN PARALLEL · 0.01 SOL PER TICKET
    </p>
  </header>
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {pools.map((p) => <PoolCard key={p.publicKey} pool={p} />)}
  </div>
</section>
```

- [ ] **Step 2: Build + visual**

Run: `npm run build` then visual check at localhost.
Expected: 4 pools in a 2x2 grid (1-col on mobile, 2-col on lg+).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(pools): 2-col grid + section heading per mockup"
```

---

## Stage 4 — Activity feed + table

### Task 4.1: Restyle RecentWinners → Recently Played feed

**Files:**
- Modify: `src/components/RecentWinners.tsx`

Source: mockup lines 794–858.

- [ ] **Step 1: Replace render body with feed look**

Open `src/components/RecentWinners.tsx`. Keep all data hooks. Replace JSX return:

```tsx
return (
  <section className="mx-auto max-w-7xl px-6 pb-20">
    <header className="mb-6">
      <h2 className="font-display text-3xl uppercase tracking-tight">RECENTLY PLAYED ON TOMBOLA</h2>
    </header>
    <ul className="space-y-2">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-center gap-4 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
          <span className="size-2 rounded-full" style={{ background: accentForPool(ev.poolType) }} aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400">{ev.shortPoolType}</span>
          <span className="text-sm text-white">{ev.poolType} Round #{ev.roundIndex}</span>
          <span className="flex-1 truncate text-sm text-neutral-400">{ev.summary}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">{ev.age} ↗</span>
        </li>
      ))}
    </ul>
    <div className="mt-6 flex justify-center">
      <a href="#stats" className="btn-parent btn-inset inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <span>VIEW ALL</span>
        <span className="chip flex size-6 items-center justify-center rounded-full bg-neutral-900 text-white">↗</span>
      </a>
    </div>
  </section>
);
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/components/RecentWinners.tsx
git commit -m "feat(recent): mockup feed look — colored dot + pool tag + summary + age"
```

---

### Task 4.2: AllRoundsTable component

**Files:**
- Create: `src/components/AllRoundsTable.tsx`

Source: mockup lines 870–928.

- [ ] **Step 1: Implement AllRoundsTable**

Create `src/components/AllRoundsTable.tsx`:

```tsx
import type { PoolView } from "@/lib/mock-pools";
import { accentForPool } from "@/lib/pool-accent";

/**
 * Server component. Reads the same `pools` array that PoolCard does
 * and renders a tabular leaderboard view.
 */
export function AllRoundsTable({ pools }: { pools: PoolView[] }) {
  return (
    <section id="stats" className="mx-auto max-w-7xl px-6 pb-20">
      <header className="mb-6">
        <h2 className="font-display text-3xl uppercase tracking-tight">ALL ROUNDS</h2>
      </header>
      <div className="overflow-hidden rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
            <tr className="border-b border-white/5">
              <th className="px-5 py-3 text-left">RANK</th>
              <th className="px-5 py-3 text-left">POOL</th>
              <th className="px-5 py-3 text-left">ROUND</th>
              <th className="px-5 py-3 text-left">POT</th>
              <th className="px-5 py-3 text-left">TICKETS</th>
              <th className="px-5 py-3 text-left">BUYERS</th>
              <th className="px-5 py-3 text-left">STATE</th>
              <th className="px-5 py-3 text-right">CLOSES / WINNER</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p, i) => (
              <tr key={p.publicKey} className="border-b border-white/5 last:border-b-0">
                <td className="px-5 py-3 font-mono text-neutral-500">#{i + 1}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full" style={{ background: accentForPool(p.typeLabel) }} aria-hidden />
                    {p.typeLabel}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono">#{p.roundIndex.toString()}</td>
                <td className="px-5 py-3 font-display tabular-nums">{p.potSol.toFixed(2)} SOL</td>
                <td className="px-5 py-3 tabular-nums">{p.ticketsSold.toLocaleString()}</td>
                <td className="px-5 py-3 tabular-nums">{p.uniqueBuyers}</td>
                <td className="px-5 py-3">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]">
                    {p.state}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-neutral-400">
                  {p.state === "Open" ? p.closesIn : (p.winnerShort ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into page.tsx**

Open `src/app/page.tsx`. Import + render after RecentWinners:

```tsx
import { AllRoundsTable } from "@/components/AllRoundsTable";
// ...
<AllRoundsTable pools={pools} />
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/components/AllRoundsTable.tsx src/app/page.tsx
git commit -m "feat(stats): all-rounds leaderboard table"
```

---

## Stage 5 — Static sections + bento footer

### Task 5.1: Restyle HowItWorks (3-step)

**Files:**
- Modify: `src/components/HowItWorks.tsx`

Source: mockup lines 1027–1050.

- [ ] **Step 1: Replace render body**

Open `src/components/HowItWorks.tsx`. Replace render body:

```tsx
const STEPS = [
  { num: "01", title: "PICK & BUY",    body: "Each ticket is 0.01 SOL. The more you hold, the higher your chance.", color: "var(--lavender)" },
  { num: "02", title: "WAIT FOR DRAW", body: "Switchboard On-Demand posts a verifiable random number on-chain.", color: "var(--mint)" },
  { num: "03", title: "AUTO-PAYOUT",   body: "Winning ticket gets the pot directly. No claim step. 0.5% to treasury.", color: "var(--yellow)" },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5 p-8 grid gap-8 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.num}>
            <div className="flex items-center gap-3">
              <span
                className="flex size-7 items-center justify-center rounded-full text-[11px] font-mono font-bold"
                style={{ background: s.color, color: "var(--bg)" }}
              >
                {s.num}
              </span>
            </div>
            <h3 className="mt-4 font-display text-base uppercase tracking-tight">{s.title}</h3>
            <p className="mt-2 text-sm text-neutral-400">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/components/HowItWorks.tsx
git commit -m "feat(how-it-works): 3 numbered cards (Pick&Buy / Wait / Auto-Payout)"
```

---

### Task 5.2: WhyItsFair component

**Files:**
- Create: `src/components/WhyItsFair.tsx`

Source: mockup lines 940–1024.

- [ ] **Step 1: Implement WhyItsFair**

Create `src/components/WhyItsFair.tsx`:

```tsx
const PILLARS = [
  {
    label: "VERIFIABLE",
    headline: "Switchboard On-Demand draw",
    body: "Every winning ticket is selected by an on-chain VRF. Anyone can verify the seed → winner mapping with the round's slot + pubkey. No off-chain randomness, no operator privilege.",
  },
  {
    label: "INSTANT",
    headline: "Auto-payout the same block",
    body: "The winning ticket gets the pot transferred at the same instruction the draw lands in. No claim window, no operator approval, no \"check email for prize\" loop.",
  },
  {
    label: "AUDIT-READY",
    headline: "Open-source program + tests",
    body: "Anchor program + Switchboard adapter + 12-step build manifest live in a public repo. Every state transition is enumerated; every threat is documented in THREAT_MODEL.md.",
  },
] as const;

export function WhyItsFair() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-6 pb-20">
      <header className="mb-8">
        <h2 className="font-display text-5xl uppercase tracking-tight">WHY IT'S FAIR</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Three things that make Tombola different from a centralized raffle.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <article key={p.label} className="rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5 p-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">{p.label}</p>
            <h3 className="mt-3 font-display text-lg uppercase leading-tight">{p.headline}</h3>
            <p className="mt-3 text-sm text-neutral-400">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into page.tsx + build + commit**

```tsx
import { WhyItsFair } from "@/components/WhyItsFair";
// ...
<WhyItsFair />
```

```bash
npm run build
git add src/components/WhyItsFair.tsx src/app/page.tsx
git commit -m "feat(why-fair): 3 pillars (Verifiable / Instant / Audit-ready)"
```

---

### Task 5.3: BentoFooter

**Files:**
- Create: `src/components/BentoFooter.tsx`

Source: mockup lines 1052–1120.

- [ ] **Step 1: Implement BentoFooter**

Create `src/components/BentoFooter.tsx`:

```tsx
import type { PoolView } from "@/lib/mock-pools";

/**
 * Server component. Aggregates totals across all pools and renders
 * the bento-style footer block (Total Pot, Players, Follow X, GitHub,
 * Program ID, Protocol Fee, final BUY A TICKET CTA).
 */
export function BentoFooter({
  pools,
  programId,
  cluster,
}: {
  pools: PoolView[];
  programId: string;
  cluster: string;
}) {
  const totalPotSol = pools.reduce((sum, p) => sum + p.potSol, 0);
  const totalRounds = pools.length;
  const totalPlayers = new Set(pools.flatMap((p) => p.recentBuyers ?? [])).size;

  return (
    <section id="faq" className="mx-auto max-w-7xl px-6 pb-24">
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {/* LEFT: headline + tagline */}
        <div className="rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5 p-8">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-white">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4"  fill="var(--lavender)" />
          </svg>
          <h2 className="mt-6 font-display text-5xl uppercase leading-[0.95]">
            DISCOVER<br />WIN<br />REPEAT.
          </h2>
          <p className="mt-4 text-sm text-neutral-400">
            A new round opens automatically the moment the last one settles.
          </p>
        </div>

        {/* RIGHT: bento grid */}
        <div className="grid grid-cols-2 gap-4">
          <Tile label="TOTAL POT">
            <div className="font-display text-4xl tabular-nums">
              {totalPotSol.toFixed(2)} <span className="text-base text-neutral-400">SOL</span>
            </div>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">{totalRounds} ROUNDS</p>
          </Tile>
          <Tile label="PLAYERS">
            <div className="font-display text-4xl tabular-nums">{totalPlayers}</div>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">UNIQUE BUYERS</p>
          </Tile>
          <Tile label="FOLLOW">
            <a href="https://x.com/tombola" target="_blank" rel="noreferrer" className="font-display text-2xl uppercase tracking-tight">𝕏</a>
          </Tile>
          <Tile label="GITHUB">
            <a href="https://github.com/AtlasBrain/Project-Tombola" target="_blank" rel="noreferrer" className="font-display text-2xl uppercase tracking-tight">REPO ↗</a>
          </Tile>
          <Tile label={`PROGRAM ID · ${cluster.toUpperCase()}`}>
            <code className="block font-mono text-[11px] tracking-tight text-neutral-300 break-all">{programId}</code>
          </Tile>
          <Tile label="PROTOCOL FEE">
            <div className="font-display text-4xl">0.5%</div>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">NO HIDDEN CUTS</p>
          </Tile>
          <div className="col-span-2">
            <a
              href="#pools"
              className="btn-parent btn-tear btn-tear-block flex h-20 items-center justify-center gap-3 text-base font-semibold uppercase tracking-[0.12em]"
            >
              <span className="btn-stack" style={{ height: "1.5rem" }}>
                <span className="stack" style={{ height: "1.5rem" }}>
                  <span style={{ height: "1.5rem", lineHeight: "1.5rem" }}>BUY A TICKET</span>
                  <span style={{ height: "1.5rem", lineHeight: "1.5rem" }}>LET'S GO →</span>
                </span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-[var(--bg-elevated)] ring-1 ring-white/5 p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into page.tsx**

Replace any existing footer/StatsBar block with:

```tsx
import { BentoFooter } from "@/components/BentoFooter";
// ...
<BentoFooter pools={pools} programId={PROGRAM_ID.toString()} cluster={CLUSTER} />
```

If `PoolView` doesn't have `recentBuyers`, replace `totalPlayers` with `pools.reduce((s, p) => s + p.uniqueBuyers, 0)`.

- [ ] **Step 3: Build + visual + commit**

```bash
npm run build
git add src/components/BentoFooter.tsx src/app/page.tsx
git commit -m "feat(footer): bento with total pot / players / X / GitHub / program ID / final CTA"
```

---

### Task 5.4: Final page composition

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Final structure**

Page should now compose like:

```tsx
return (
  <>
    <Ticker />
    <Header cluster={CLUSTER} />
    <Hero />
    <main>
      <section id="pools" className="...">
        {/* PoolCards */}
      </section>
      <RecentWinners events={events} />
      <AllRoundsTable pools={pools} />
      <WhyItsFair />
      <HowItWorks />
      <BentoFooter pools={pools} programId={PROGRAM_ID.toString()} cluster={CLUSTER} />
    </main>
    <FaqSection />  {/* if still wanted; can drop since BentoFooter has #faq id */}
    {/* footer link strip */}
    <footer className="border-t border-white/5 py-6 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
      © 2026 TOMBOLA · OPEN SOURCE · TERMS · PRIVACY · GITHUB
    </footer>
  </>
);
```

- [ ] **Step 2: Build + visual + tests**

```bash
npm run build
npm test
```

Visual: scroll the whole page top-to-bottom — every section should match the mockup. Hover BUY A TICKET → ticket-tear effect visible. Click any nav link → smooth-scrolls.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(layout): final page composition matches recolored mockup"
```

---

## Stage 6 — Polish

### Task 6.1: prefers-reduced-motion

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append accessibility rule**

Append to `src/app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .spin-slow,
  .spin-counter,
  .spin-fast,
  .orbit-tickets,
  .ticker-track,
  .pulse-soft,
  .float-a,
  .float-b,
  .float-c,
  .float-d,
  .float-e,
  .float-f {
    animation: none !important;
  }
  section[id]:target { animation: none !important; }
  html { scroll-behavior: auto !important; }
}
```

- [ ] **Step 2: Verify in OS settings**

(macOS: System Preferences → Accessibility → Display → Reduce motion.) Refresh localhost:3000/. All animations stop; ring stays static.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "a11y: pause heavy animations under prefers-reduced-motion"
```

---

### Task 6.2: Build + push + Vercel preview

- [ ] **Step 1: Final clean build**

Run: `rm -rf .next && npm run build`
Expected: success, 5-page prerender, no warnings.

- [ ] **Step 2: Tests green**

Run: `npm test`
Expected: 47+ tests pass (including new smooth-scroll, pool-accent).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Get the Vercel preview URL**

```bash
gh api repos/AtlasBrain/tombola-frontend/deployments --jq '.[0].statuses_url' \
  | xargs -I{} curl -s {} | jq -r '.[0].environment_url'
```

Open the URL — verify the deployed redesign matches local.

- [ ] **Step 5: Open PR**

```bash
gh pr create --base main --title "feat: port redesign-v1-recolored to React (lavender palette)" --body "$(cat <<'EOF'
## Summary
- Replaces dark-emerald look at `/` with the recolored mockup design (lavender/cream/aubergine + per-pool accents).
- New components: Header, Hero, HeroRing, HeroFloatingIcons, Ticker, AllRoundsTable, WhyItsFair, BentoFooter.
- Restyled: PoolCard, BuyTicketButton (ticket-tear hover), HowItWorks, RecentWinners, ConnectWalletButton.
- All on-chain logic untouched (live pool reads, sign-only buy flow, wallet adapter).

## Test plan
- [ ] `npm run build` clean
- [ ] `npm test` all green (47+ tests)
- [ ] Vercel preview at `/` shows the recolored design
- [ ] Hover BUY A TICKET → ticket-tear + stack-reveal triggers
- [ ] Click nav links → smooth-scroll
- [ ] Localnet still serves live pool data (LOCALNET pill in header reflects)
- [ ] Buy flow still works on localnet

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (after writing this plan)

1. **Spec coverage:**
   - Ticker (mockup 326–351) → Stage 2 Task 2.3 ✓
   - Header (352–394) → Task 2.7 ✓
   - Hero ring + icons + CTAs (395–559) → Tasks 2.4–2.6 ✓
   - Pool grid (560–783) → Stage 3 Tasks 3.1–3.3 ✓
   - Recent activity (784–860) → Task 4.1 ✓
   - All rounds table (861–933) → Task 4.2 ✓
   - Why it's fair (934–1026) → Task 5.2 ✓
   - How it works (1027–1050) → Task 5.1 ✓
   - Bento (1051–1121) → Task 5.3 ✓
   - Footer link strip (1122+) → Task 5.4 ✓
   - Smooth-scroll JS → Task 2.1 ✓
   - Tokens + fonts + keyframes → Stage 1 ✓
   - Button effects (inset-fill, stack-reveal, ticket-tear) → Task 1.4 + applied in Tasks 2.6, 2.8, 3.2 ✓
   - prefers-reduced-motion → Task 6.1 ✓

2. **Type consistency:**
   - `PoolView` field references (`typeLabel`, `roundIndex`, `state`, `potSol`, `ticketsSold`, `targetTickets`, `uniqueBuyers`, `closesIn`, `explorerUrl`, `winnerShort`, `recentBuyers`, `ticketPriceSol`) — must match `src/lib/mock-pools.ts`. **First task at execution time:** read `mock-pools.ts` and update any field name mismatches before Task 3.1.
   - `accentForPool(label)` returns CSS var string — used consistently in PoolCard, RecentWinners, AllRoundsTable, Ticker.
   - `smoothScrollToId(id)` used in Hero + Header + RecentWinners VIEW ALL.

3. **Risk areas (read these mockup line ranges before implementing the corresponding task):**
   - HeroRing geometry (Task 2.4) — re-read mockup lines ~471–530 to match exact radii / strokes
   - HeroFloatingIcons positions (Task 2.5) — re-read 401–478 and tweak Tailwind absolute classes after preview
   - Button effects (Task 1.4) — clip-path lives on `::before` per chat1.md (avoid the AA grayscale bug)

---

## Execution Notes

- Each task ends with a commit. ~25 commits total. Easy to revert any single visual change.
- Stages 1, 2 are sequential. Stages 3–6 are mostly independent — order can shift if you spot a high-leverage tweak.
- All work happens on `feature/dashboard-infographics` (current branch). When everything ships, merge via PR (Stage 6 Task 6.2 Step 5) — same flow as the previous 6 PRs.
- If `npm test` flakes on a CI environment (Node 24 issues), use `nvm use 22` first.
- The `--lime` CSS-var alias is intentional during the port. Stage 6 should kill it once all components reference `--lavender` directly. (Add a Task 6.0 if wanted.)

---

**Plan complete.** Ready to hand to subagent-driven-development.

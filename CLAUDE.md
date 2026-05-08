# Claude instructions for tombola-frontend

These instructions ALWAYS apply when working in this repo. Loaded automatically by Claude Code at session start.

## Read first

1. **`SESSION_HANDOFF.md`** — the canonical resume entry point (phase status, recent commits, next-step plan).
2. **`README.md`** — file layout + quickstart commands.

The companion repo at `~/Desktop/Project Tombola` (also on GitHub: `AtlasBrain/Project-Tombola`) holds the on-chain Anchor program and the TS SDK that this frontend will consume in phase 3. Its `SESSION_HANDOFF.md`, `DESIGN_DECISIONS.md` (D-001..D-071), and `THREAT_MODEL.md` are authoritative for protocol questions.

## Conventions to keep using

- **Server components by default.** `"use client"` only when the component uses state, effects, browser APIs, or wallet adapter. Don't promote a whole subtree to client just to use a hook in one place.
- **BigInt for on-chain numeric types.** Lamport amounts, ticket counts, rounds. Never `number` for these — overflow at 2^53 is a real issue when SOL amounts grow.
- **Tailwind utilities own colour and layout.** No `<body>` background rules in `globals.css` — that fight was lost once already (commit `000912f` for the receipt). Tailwind classes like `bg-neutral-950` on `<body>` carry the dark theme.
- **Mock data shape mirrors on-chain shape.** The `PoolView` type in `src/lib/mock-pools.ts` matches the on-chain `PublicPool` account so phase 3 is a swap, not a rewrite. Hold this discipline as new mocks are added.
- **`@/*` import alias** resolves to `src/*`. Use it; no relative `../../` chains.
- **Each Phase = its own commit** (or a small set of commits per logical chunk). Commit messages reference the phase: `feat: phase 5 — hover states on PoolCard` etc.

## What to avoid

- Adding `next/font` declarations outside `src/app/layout.tsx` — fonts are already wired and Tailwind's `font-sans` utility flows from there.
- Inline styles in JSX except where overriding a third-party component's defaults (the wallet-adapter button is the only current case; see `ConnectWalletButton.tsx`). Tailwind > inline.
- Importing `@solana/web3.js` v1 types directly into our own SDK modules. The Tombola SDK is `@solana/kit` 6.x at heart; web3.js is quarantined in the wallet-adapter boundary.
- Running `npm run dev` and `npm run build` interleaved without `rm -rf .next` between them. They write incompatible artifacts to the same cache; symptom is `Cannot find module './XXX.js'`.

## Hygiene gate before any commit

```bash
npm run build      # type-check + tailwind compile + lint + 5-page prerender
```

If that's clean, the commit is shippable. There's no test suite yet — phase 5 doesn't introduce one (purely visual work). When phase 3 lands and we have logic worth testing, vitest goes in.

## Tone

This user is **new to frontend** but technically rigorous (12-step Solana program build with audit-ready discipline in the companion repo). Explain frontend concepts in terms of analogues they know (React effects ≈ subscriptions, useState ≈ a tiny reactive store). Never condescend; never over-explain syntax they can read. When introducing a new concept, lead with WHY not HOW.

Match the established communication style: short, technical, file paths and line numbers, no narration of internal deliberation.

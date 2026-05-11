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

---

## Major features added 2026-05-10 → 2026-05-12

### Keeper (raffle auto-resolution) — fully cloud-resident
- Code: `src/lib/keeper/{wallet,scan,commit,settle,tx,logger}.ts` (server-only); route at `src/app/api/keeper/tick/route.ts`.
- Fired every minute by **cron-job.org** ("WinnerSelector" job) sending `Authorization: Bearer <CRON_SECRET>` to the route. Daily Vercel cron in `vercel.json` is a safety-net (Hobby plan limit).
- Required env vars on Vercel: `KEEPER_KEYPAIR`, `CRON_SECRET`, `SOLANA_RPC_URL`. KV vars auto-injected by Upstash marketplace.
- **Critical constraint** (`vrf.rs:60` on-chain): `clock_slot == reveal_slot`. Reveal+settle MUST be one tx. Keeper `simulateTransaction(revealIx)` first to learn the value, picks winning batch from sim, then sends `[revealIx, settleIx]` atomically.
- Recovery path: when randomness `value` is non-zero on entry (stale reveal from a previous slot), keeper sends fresh `commitIx`, sleeps 6s for slot delay, then atomic reveal+settle.
- The legacy `beta/keeper/` standalone-Node service is now dead; do not edit.

### Profile + friends system
- Page: `/u/[handle]` where handle is wallet pubkey OR claimed pseudo (case-insensitive).
- Storage: Upstash KV via Vercel Marketplace. Schema in `src/lib/profile-store.ts` + `src/lib/friend-store.ts`.
- Auth: every mutation = client signs `tombola:<context>:<nonce>` via `signMessage`; server verifies with `tweetnacl`, consumes the nonce (single-use, 5-min TTL).
- `src/lib/pseudo-cache.ts` is the canonical pattern for wallet→pseudo lookups across the app. Use the same shape for new wallet-keyed lookups.

## On-chain account sizes (used as `dataSize` filters across the codebase)
- PublicPool = 150  · PrivatePool = 216  · TicketBatch = 89.
- TicketBatch field offsets: `pool` at 8, `owner` at 40.
- PROTOCOL_FEE_BPS = 50 (0.5%) — matches `programs/raffle/src/constants.rs` in the companion repo.

## Tech-debt hotspots (audit 2026-05-12 — see memory `ref_tech_debt_hotspots.md`)
- `bytesToBase58` / `base58ToBytes` reimplemented in 6 files → use the existing `bs58` dep.
- `unwrapOption<T>` reimplemented in 5 files → needs `src/lib/codec/option.ts`.
- `TICKET_BATCH_SIZE` / `PRIVATE_POOL_SIZE` / `PUBLIC_POOL_SIZE` declared in 7+ files → needs `src/lib/constants.ts`.
- `CreatorDashboard.tsx` (681), `BuyerDashboard.tsx` (597), `ProfileCard.tsx` (577) all worth splitting into a hook + presentational components.
- No rate-limiting on API routes (`@upstash/ratelimit` is the drop-in).
- `src/lib/keeper/scan.ts` fetches every PrivatePool each tick — add a state-byte `memcmp` filter.

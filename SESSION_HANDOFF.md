# Session Handoff — Tombola Frontend

**Last updated:** 2026-05-08, end of phase 2 + Vercel deploy.
**Read this file first when resuming.** Then `README.md` for the layout.

**Live URL:** https://tombola-frontend-gamma.vercel.app/
**Repo:** https://github.com/AtlasBrain/tombola-frontend (private, owner `AtlasBrain`)
**Companion repo (program + SDK):** https://github.com/AtlasBrain/Project-Tombola

---

## Where we are

Web UI for the Tombola on-chain raffle protocol. **Phases 1, 2, 6 done; phase 3+4 deferred (devnet SOL); phase 5 (polish) is the next productive step.**

| phase | what | status |
|---|---|---|
| 1 | visual shell with mocked pool data | ✅ commit `9babee1` |
| 2 | wallet connect (Phantom/Solflare/Backpack via Wallet Standard) | ✅ commit `352de5a` |
| theme fix | dropped `globals.css`'s body overrides | ✅ commit `000912f` |
| 6 | production deploy via Vercel | ✅ live |
| 3 | real on-chain reads via Tombola SDK | 🔒 blocked on devnet SOL |
| 4 | buy-ticket flow | 🔒 gated on phase 3 |
| 5 | polish — FAQ, "How it works", mobile, error boundaries, recent-winners mock | ⏭ next |

**4 commits on `main`**, all pushed:
```
000912f fix(theme): stop globals.css from overriding Tailwind body utilities
352de5a feat: phase 2 — wallet connect via @solana/wallet-adapter
9babee1 feat: phase 1 — visual shell with mock pool data
b39ae36 Initial commit from Create Next App
```

---

## Working state

**Branch:** `main` (only branch). Working tree should be clean — verify with `git status`.

**Stack:**
- Next.js 15.5.18 (App Router, Webpack — Turbopack disabled at scaffold)
- React 19.1.0
- TypeScript strict, target ES2020 (BigInt literals)
- Tailwind CSS v4 (via `@import "tailwindcss"` in globals.css)
- @solana/wallet-adapter 0.15 + @solana/web3.js 1.98
- Hosted on Vercel free tier

**Toolchain:**
- Node ≥ 20 (we used the system Node)
- npm (no yarn workspace; flat `package.json`)
- gh CLI 2.92 at `~/.local/bin/gh` — already authed as `AtlasBrain`

**Quickstart:**
```bash
cd ~/Desktop/tombola-frontend
npm run dev          # http://localhost:3000
npm run build        # production build sanity check
npm run lint         # eslint
```

If `npm run dev` shows `Cannot find module './XXX.js'`, run `rm -rf .next` and retry (production-build artifacts confuse the dev server).

---

## Architecture (current)

```
src/
  app/
    layout.tsx        Root layout — html.dark, body wraps children in <WalletProviders>
    page.tsx          Landing page — header (title, ConnectWalletButton), 4 pool cards, footer
    globals.css       Tailwind v4 import + @theme binding for Geist font
  components/
    PoolCard.tsx      Server component (static render). State badge, pot, tickets, countdown, ticket price.
    Countdown.tsx     Client component, useEffect+setInterval, re-renders every 1s.
    WalletProviders.tsx     Client component: ConnectionProvider + WalletProvider (wallets=[]; Wallet-Standard auto-discovery) + WalletModalProvider. Cluster: NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet").
    ConnectWalletButton.tsx Client component, dynamic(ssr:false) wrapper around WalletMultiButton, restyled to match dark theme.
  lib/
    mock-pools.ts     4 PoolView objects whose shape mirrors the on-chain PublicPool (D-058 from Project-Tombola). Will be swapped for RaffleClient.getPublicPool(...) results in phase 3.
    format.ts         Pure functions: formatSol, formatCountdown, formatTickets.
```

**Conventions:**
- Server components by default; `"use client"` only for state/effects/wallet adapter.
- `@/*` import alias resolves to `src/*`.
- All colours via Tailwind utilities; the body's `bg-neutral-950 text-neutral-100` owns the global theme. Don't add a `body { background: ... }` rule in `globals.css` — that's what we just fought.
- BigInt for all on-chain numeric types (`totalPotLamports`, `round`, etc.). Never `number`.
- Mock data shape MUST match on-chain shape so phase 3 is a swap, not a rewrite.

---

## Phase 5 (next session) — polish work, no devnet needed

Suggested order, smallest commits first:

1. **Hover/focus states on PoolCard** — interactive feel. ~10 min.
2. **"How it works" section** — 3-step explainer between header and pool grid (Buy → Wait for draw → Claim if you win). ~30 min.
3. **FAQ accordion** — "Is the randomness really random?", "What's the fee?", "Can the team rug?" — answer each via the spec/threat-model. ~45 min.
4. **Mobile-responsive audit** — open in Chrome devtools mobile emulator, fix overflow. ~30 min.
5. **Error boundary + 404 polish** — `app/error.tsx` + `app/not-found.tsx`. ~20 min.
6. **Footer cleanup** — replace placeholder address with the actual deployed one once available. ~5 min.
7. **Recent-winners mock section** — table of (round, winner address, payout, date). Same mock-then-swap pattern as pools. ~45 min.

Total: ~3 hours, broken into discrete commits.

---

## Phase 3+4 — blocked on devnet SOL (when ready)

**Two separate wallets need devnet SOL:**

1. **Deployer keypair** (`~/.config/solana/id.json` → `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt`) — needs ~2 SOL for `solana program deploy --final`.
2. **Phantom user wallet** — a different address Phantom generated; needs ~0.1 SOL for buy-ticket testing.

**Public faucets currently rate-limit both.** When you've got SOL into both, the resume recipe (also in `Project Tombola/SESSION_HANDOFF.md`) is:
1. `cd ~/Desktop/Project\ Tombola` → `solana program deploy --final target/deploy/raffle.so` (uses ~1.7 SOL)
2. `yarn deploy:devnet` (initialize_protocol)
3. Initialize a test pool with `close_time = now + 90s`
4. Back in `tombola-frontend`: copy the deployed program ID into `src/lib/program-id.ts`, swap mock-pools.ts for real `RaffleClient.getPublicPool` calls.

---

## Suggested first message in the next session

> Resume from `SESSION_HANDOFF.md`. Phase 5 is next — start with item 1 (hover/focus states on PoolCard) and we'll work through the polish items in order.

The auto-memory and CLAUDE.md (when added) will reinforce this.

# Tombola Frontend

Web UI for the [Tombola](https://github.com/AtlasBrain/Project-Tombola) on-chain raffle protocol. Next.js 15 + Tailwind + Solana wallet adapter (planned).

This repo is a **separate** project from the Anchor program at
`AtlasBrain/Project-Tombola`. The frontend is a static-rendered React app
that reads pool state from Solana via RPC and signs ticket-purchase
transactions through a connected wallet — no backend required.

## Status

Phase 1 of 6 — visual shell with mocked pool data. See "Next steps" below.

## Quickstart

```bash
npm install
npm run dev
# open http://localhost:3000
```

You should see four pool cards (Weekly, Biweekly, Triweekly, Monthly) with
realistic-looking but mocked pot/ticket counts and a live-updating
countdown timer.

## Layout

```
src/
  app/
    layout.tsx        Root layout, dark theme, fonts
    page.tsx          Landing page — header + 4 pool cards
    globals.css       Tailwind base styles
  components/
    PoolCard.tsx      Individual pool card (server component, static render)
    Countdown.tsx     Live-updating countdown ("use client", re-renders /sec)
  lib/
    mock-pools.ts     Fake pool data, shape mirrors on-chain PublicPool
    format.ts         SOL / countdown / ticket formatters (pure functions)
```

## Next steps (phase-by-phase)

| phase | what | est. time | status |
|---|---|---:|---|
| 1 | Visual shell with mocked pool data | done | ✅ |
| 2 | Wallet connect (Phantom/Solflare/Backpack via @solana/wallet-adapter) | 1 h | next |
| 3 | Real RPC reads via Tombola SDK (`RaffleClient.getPublicPool`) | 2 h | gated on devnet program deploy |
| 4 | Buy ticket flow (build instruction, sign, send, confirm) | 2 h | gated on phase 3 |
| 5 | Polish — "my tickets" view, history, error toasts, mobile | 3-4 h | iterate |
| 6 | Production deploy to Vercel | 30 min | iterate |

## Pushing to GitHub + connecting Vercel

```bash
# 1. Create the repo on GitHub (private recommended for now).
gh repo create tombola-frontend --private --source=. --push
# or via the GitHub web UI, then:
# git remote add origin git@github.com:AtlasBrain/tombola-frontend.git
# git branch -M main
# git push -u origin main

# 2. Connect to Vercel:
#    a. https://vercel.com/new → import the GitHub repo
#    b. Accept all defaults (Vercel auto-detects Next.js)
#    c. Click "Deploy"
#    d. ~60s later you have a *.vercel.app URL
#
#    Every subsequent `git push` to `main` re-deploys automatically.
```

## What's intentionally NOT in this repo (yet)

- The Tombola TS SDK lives at `Project-Tombola/sdk/src/` and will be
  imported in Phase 3. Two options when we get there: (a) copy the
  source, or (b) `npm link` the SDK package so changes flow live.
- The Anchor program itself stays in the upstream repo.
- No backend / API routes — Next.js is used as a static-prerendered
  React app. RPC reads happen from the browser.
- Mainnet config — devnet only until audit clears (see THREAT_MODEL.md
  in the program repo).

## Conventions

- TypeScript strict mode on; `tsconfig.json` target = ES2020 (BigInt literals).
- Server components by default; `"use client"` only where browser APIs
  (state, effects, wallet adapter) are needed.
- Tailwind utility classes in JSX, no separate CSS files except the
  Tailwind base.
- File paths use the `@/*` alias (resolves to `src/*`).

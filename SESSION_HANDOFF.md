# Session Handoff — Tombola Frontend

**Last updated:** 2026-05-09, redesign port + devnet migration **MERGED to main** (PR #7).
**Read this file first when resuming.** Then `README.md` for the layout.

**Live URL:** https://tombola-frontend-gamma.vercel.app/ (auto-deploys main)
**Repo:** https://github.com/AtlasBrain/tombola-frontend (private, owner `AtlasBrain`)
**Companion repo (program + SDK):** https://github.com/AtlasBrain/Project-Tombola

---

## TL;DR for resume

**Frontend work is done.** PR #7 merged to `main` (commit `d3d069b`). The dapp is:
- ✅ Fully redesigned per `public/redesign-v1-recolored.html` (lavender · coral · mint · yellow palette)
- ✅ Wired to devnet via Helius RPC (env var set on Vercel for Production + Preview)
- ✅ 52/52 tests passing, build clean, responsive at mobile/tablet/desktop
- ✅ Phantom popup E2E unblocked: connect on devnet → click BUY 1 TICKET → tx lands in Solscan
- ✅ Smooth-scroll nav, hero ring + 6 floating icons, all CTAs wired, dead links removed

**The next workstream is in the companion repo, NOT this one.**

To complete the actual on-chain raffle loop (so winners get drawn + paid), an operator-side script needs to be built in `~/Desktop/Project Tombola/scripts/`. The frontend doesn't change — it just displays whatever state the chain is in. See "Next workstream — companion repo" below.

---

## Frontend status

Web UI for the Tombola on-chain raffle protocol. **All shipped to main:** original phases 1–5 + dashboard infographics + pool detail page + 18 component tests + CI + devnet migration + full mockup port + responsive + accessibility.

### Merged PRs (all on `main`)

| # | what | merge commit |
|---|---|---|
| 1 | Phase 3+4 (localnet) + phase 5 polish wave (19 commits) | `fe202f1` |
| 2 | feat+fix: buy-ticket UX — sign-only flow + tx toasts (4 commits) | `6639fc7` |
| 3 | ci + ux polish: GitHub Actions, wallet balance, flash-on-update (3 commits) | `fc447e3` |
| 4 | test: 18 component tests — NetworkPill / FlashOnChange / BuyTicketButton | `2f9256a` |
| 5 | feat: pool detail page at `/pool/[type]/[round]` | merged via #6 |
| 6 | feat: dashboard infographics — stats bar, pot comparison, win odds | `17a7c99` |
| **7** | **feat: redesign-v1-recolored React port + devnet migration (~57 commits)** | **`d3d069b`** |

`main` HEAD is **`d3d069b`**. Vercel auto-deploys it to `tombola-frontend-gamma.vercel.app`.

### What PR #7 included (frontend complete)

- **Devnet migration**: program deployed (`qWyk54XHmEa…JFvZB1M`), 4 pools initialized, Helius RPC wired, Vercel env var set
- **Redesign port (Stages 1–6 + 6 fidelity rounds)**: tokens · Space Grotesk + Space Mono · keyframes · button effects · Ticker · Header · Hero (4-layer ring SVG with `ringGrad` linear gradient + 6 floating icons) · PoolCard (per-pool gradient + POT block + 3-stat tiles + ticket-tear BUY button) · RecentWinners · AllRoundsTable · WhyItsFair · HowItWorks · BentoFooter · responsive (mobile/tablet/desktop) · `prefers-reduced-motion`
- **Palette**: Weekly lavender `#c9b5dc` · Biweekly **coral `#E89999`** (was `#b8a5d4` lavender — too close to Weekly) · Triweekly mint `#88cfc4` · Monthly yellow `#e8d89e`
- **Buttons audit**: smooth-scroll on all nav links, wallet modal on CONNECT + BUY 1 TICKET when not connected, all hrefs verified
- **Test fix**: BuyTicketButton test updated to match the wallet-modal flow (52/52 still passing)

---

## Next workstream — companion repo (Project Tombola)

**Open a fresh Claude session inside `~/Desktop/Project Tombola/`**, NOT in this repo.

### What needs to be built there

An operator-side script `scripts/run_draw_devnet.ts` (or `.mts`) that:

1. **Polls** `getProgramAccounts` for pools with `state === Open` AND `close_time < now`
2. **Creates a Switchboard `Randomness` account** on devnet (~0.05 SOL each, see `sdk/src/switchboard.ts` for the boundary)
3. **Bundles `commit_draw_public` + Switchboard's commit ix** in one tx, sends it
4. **Polls until Switchboard fulfills** the request (~5–30s on devnet)
5. **Computes the winning ticket index off-chain** (random number → batch index)
6. **Sends `settle_draw_public`** with the winner pubkey + treasury account
7. **Sends `reopen_public_pool`** to open round N+1
8. (Optional) **Sleeps + repeats** so it can run as a daemon

### Why this is companion-repo work, not frontend work

- The frontend already displays whatever state the chain is in (LivePoolWatcher subscribes to WS)
- The work is Anchor / Switchboard SDK / Solana CLI — companion repo's domain
- The companion repo's `CLAUDE.md` enforces audit-grade discipline (12-step build, threat model, etc.) that this frontend repo doesn't have

### SDK pieces already in place

The companion repo has:

- `sdk/src/client.ts:283` — `commitDrawPublic(args)` returns the kit Instruction
- `sdk/src/client.ts:303` — `settleDrawPublic(args)` returns the kit Instruction
- `sdk/src/client.ts:331` — `retryDrawPublic(args)` (1h timeout fallback)
- `sdk/src/client.ts:349` — `reopenPublicPool(args)` for round N+1
- `sdk/src/switchboard.ts` — Switchboard On-Demand boundary (web3.js v1 → kit conversion). Imports `Randomness, Queue, ON_DEMAND_DEVNET_QUEUE, ON_DEMAND_MAINNET_QUEUE` from `@switchboard-xyz/on-demand`

Reference flows:
- `programs/raffle/tests/test_full_public_lifecycle.rs` — end-to-end test of the draw cycle
- `tests/surfpool_smoke.test.ts` — TS smoke test that runs the full lifecycle

### First message for the new session (in companion repo)

> Resume from `SESSION_HANDOFF.md`. Build the operator-side draw cycle for devnet:
> a script `scripts/run_draw_devnet.ts` that watches for closed pools, fires
> `commit_draw_public` + Switchboard's commit ix, polls for fulfillment,
> fires `settle_draw_public`, fires `reopen_public_pool`. Reference
> `sdk/src/client.ts:283-374` for the existing SDK hooks and
> `sdk/src/switchboard.ts` for the kit↔web3.js boundary. Test against the
> 4 devnet pools already deployed (program ID `qWyk54XHmEa…JFvZB1M`).
> Frontend dapp at `tombola-frontend-gamma.vercel.app` will display state
> changes automatically via LivePoolWatcher.

### Devnet deploy state (for the new session's reference)

- **Program ID:** `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M`
- **Operator (CLI) keypair:** `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt` (~1.81 SOL remaining after deploy + init — top up via Helius faucet for Switchboard fees)
- **Frontend wallet (Phantom):** `A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY`
- **Pool PDAs:**
  - Weekly:    `HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW`
  - Biweekly:  `2uHKExQfGnm5UkLEyYc2kMBaWvsJviRRPF7XATP5z8JA`
  - Triweekly: `AxWU6PTuC4W2nriNJ1Btzd1uqbMmUMQUvPJ58QH2cW7v`
  - Monthly:   `6zXWAr7CDr7X6uMmyyUbtq26uUxchQwotATn9uLZV5TM`
- **RPC:** `https://devnet.helius-rpc.com/?api-key=264e024a-5cda-44c8-8e11-d028c250a3e1` (free Helius tier, 100k req/day)

### SDK patches still uncommitted in companion repo

The companion repo is currently on branch `fix/sdk-esm-and-web-crypto` with uncommitted patches that the frontend depended on:

1. `sdk/src/merkle.ts:11` — `import { keccak_256 } from "js-sha3"` → default-import workaround for ESM/CJS interop
2. `sdk/src/codes.ts:10` — `crypto.getRandomValues()` instead of `node:crypto` for browser bundling

Both shipped fine in the vendored SDK snapshot used by this frontend. The companion repo session should commit them before doing draw-cycle work.

---

## Optional follow-ups in THIS frontend repo (low priority)

These are nice-to-haves; not blocking the demo loop. Pick up in a future frontend session:

1. **Real recent-winners feed** — currently 5 hardcoded events in `RecentWinners.tsx`. Wire to actual Resolved-state pools. Same source as the on-chain reads.
2. **Real ticker events** — same story; `Ticker.tsx` uses 7 hardcoded events.
3. **Re-add MyTickets** — component still exists in `src/components/MyTickets.tsx` but was removed from the page during the redesign. Could fit between Pool Grid and Recently Played.
4. **Pool card → pool detail page link** — `src/app/pool/[type]/[round]/page.tsx` exists but isn't linked from the cards.
5. **Lighthouse audit + SEO/OG meta** — nothing fancy added in the redesign.
6. **Drop unused `--pink: #e8a5c0` token** in `globals.css` (Biweekly is now coral, this is dead).
7. **More tests** — 52 currently, mostly unit. Add integration tests for buy flow + hero scroll + state transitions.

These don't block anything. The frontend ships as-is.

---

## Where we are

Web UI for the Tombola on-chain raffle protocol. **Phases 1–5 complete + 5 surfaced ideas + dashboard infographics + pool detail page + 18 component tests + CI workflow shipped to main · devnet migration done (program live, pools initialized, Phantom E2E unblocked).**

### Merged PRs (all on `main`)

| # | what | merge commit |
|---|---|---|
| 1 | Phase 3+4 (localnet) + phase 5 polish wave (19 commits) | `fe202f1` |
| 2 | feat+fix: buy-ticket UX — sign-only flow + tx toasts (4 commits) | `6639fc7` |
| 3 | ci + ux polish: GitHub Actions, wallet balance, flash-on-update (3 commits) | `fc447e3` |
| 4 | test: 18 component tests — NetworkPill / FlashOnChange / BuyTicketButton | `2f9256a` |
| 5 | feat: pool detail page at `/pool/[type]/[round]` | merged via #6 (no separate merge commit) |
| 6 | feat: dashboard infographics — stats bar, pot comparison, win odds | `17a7c99` |

`main` HEAD is **`17a7c99`**.

### Open / in-progress: design exploration

Branch **`feature/dashboard-infographics`** is **11 commits ahead of `main`** with HTML mockups only (no React code changes). The branch is pushed to origin; no PR is open. Vercel preview URL exists per the branch.

```
c007ae0 docs(design): slower JS smooth-scroll + 3 palette alternatives  ← HEAD
59f6e4d docs(design): center nav on the page axis + smooth scroll + hover effect
6ff4ab3 docs(design): smaller, livelier ring — 4 layers spinning at different speeds
3510fed docs(design): visible ring, livelier icons, lighter background
7f7be59 docs(design): big surrounding ring + chunkier icons + Solana logo / confetti
eec2eb5 docs(design): floating hero icons + 4-zone tonal background
5ce1758 docs(design): smaller hero ring, drop chip noise, tonal background
c4fd059 docs(design): pools become focal section + infographic cards + reorder
0b58930 docs(design): pastel palette — drop the neon, match Metadrop's track hues
72a4255 docs(design): redesign v1 → Metadrop palette + typography
e7f025d docs(design): redesign-v1 static mockup (Metadrop-inspired)
```

---

## Active design decisions pending

The user wants the redesign to **escape the lime-green casino/lottery aesthetic** and is evaluating four palette directions. All four are live as standalone HTML files in `public/` (served by `npm run dev` and the Vercel preview).

| URL | Palette | Vibe |
|---|---|---|
| `/redesign-v1.html` | dark + bright **lime green** primary, pastel lavender/peach/sky/rose accents | Metadrop-style; user said "too neon / too casino-like" |
| `/palette-warm.html` | dark warm bg + **cream / burgundy / gold / olive / navy** | champagne raffle, philanthropic-gala, sophisticated |
| `/palette-purple.html` | deep purple-black + **Solana brand purple #9945ff + aqua #14f195** + pink + orange | web3-native, Solana-ecosystem-aligned |
| `/palette-light.html` | **warm cream paper bg** + ink + forest + terracotta + dusty blue + mustard | editorial, serene, completely opposite of dark-dapp default |

The shared structure across all four mockups: nav (3-col grid for true centering) + hero (status pill, headline, ring with 4 spinning layers and floating icons, CTAs) + 4 pool cards in a 2-col infographic-rich grid (POT / 3 mini-stats / progress bar / colored CTA) + recently-played list + footer.

Source files mirror the public copies under `docs/design/`.

**Next session's first task is most likely**: pick one (or hybrid), port it to the real React components in 2–3 PRs (header + hero, then pool cards + sections, then footer/bento).

---

## Bring the localnet dapp back up

The `solana-test-validator` ledger is wiped each restart (--reset). Recipe to get from cold to a working dapp + 4 pools + funded Phantom address:

```bash
PHANTOM_ADDRESS=A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY \
  ./scripts/reset-localnet.sh
```

That orchestrator does: kill any existing validator → wipe ledger → start fresh validator → wait for RPC + WS → deploy program → init protocol → init 4 pools with **test-friendly durations** (Weekly **10 min**, Biweekly 14 d, Triweekly 21 d, Monthly 30 d) → transfer 1M SOL to the Phantom address.

Then:
```bash
npm run dev          # http://localhost:3000
```

Connect Phantom (any cluster — sign-only flow means cluster mismatch doesn't matter; click "Approve" through the red sim warning). Click `Buy ticket — 0.01 SOL` and watch the WS subscription auto-update the card.

For an unattended buy (script signs with `~/.config/solana/id.json` directly):
```bash
npx tsx scripts/buy_test_ticket.mts                      # 1 Weekly ticket
npx tsx scripts/buy_test_ticket.mts --pool=2 --qty=3     # 3 Triweekly
```

Refresh the dapp; the affected card pulses amber via `<FlashOnChange>`.

---

## Wallet popup E2E status

✅ **Working on devnet.** Phantom + Solflare speak devnet natively (no custom-RPC blocker). The dapp connects, signs, broadcasts, and tx confirms cleanly via the existing wallet-adapter integration (`signTransaction` + dapp-side `sendRawTransaction` from `BuyTicketButton.tsx`). Localnet recipe is preserved as the offline fallback but no longer the canonical demo target.

Cluster details:
- **RPC:** Helius free tier (`https://devnet.helius-rpc.com/?api-key=...`) — 100k req/day handles live polling without throttling.
- **Signer (deploy + init):** `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt` (CLI keypair · ~1.81 SOL remaining after deploy + init).
- **Wallet (UI buy flow):** `A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY` (Phantom · ~1 SOL devnet).
- **Program ID:** `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M` (same keypair as localnet — reused).
- **Pool PDAs:**
  - Weekly:    `HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW` (closes 2026-05-09T10:16:20Z)
  - Biweekly:  `2uHKExQfGnm5UkLEyYc2kMBaWvsJviRRPF7XATP5z8JA` (closes 2026-05-23)
  - Triweekly: `AxWU6PTuC4W2nriNJ1Btzd1uqbMmUMQUvPJ58QH2cW7v` (closes 2026-05-30)
  - Monthly:   `6zXWAr7CDr7X6uMmyyUbtq26uUxchQwotATn9uLZV5TM` (closes 2026-06-08)

Bring-up recipe lives in `README.md → "Devnet bring-up"`. Reproducible via the checked-in plan at `docs/superpowers/plans/2026-05-09-devnet-migration.md`.

---

## SDK patches needed in companion repo

Two real bugs surfaced when running the SDK outside vitest. Both are uncommitted in `~/Desktop/Project Tombola/sdk/src/`. **Review and commit them in the program repo** (run hygiene gate after — `cargo test`, `vitest`, `prettier --check`).

### `merkle.ts:11`

```diff
-import { keccak_256 } from "js-sha3";
+import sha3 from "js-sha3";
+const { keccak_256 } = sha3;
```

`js-sha3` is CJS with `module.exports = methods` (runtime assignment). Node 22+ ESM strict loader can't synthesize the named export. Vitest is looser, so unit tests pass — but `tsx scripts/deploy.ts` and any browser bundle hit it immediately.

### `codes.ts:10`

```diff
-import { randomBytes } from "node:crypto";
-
-import { hashLeaf, buildTree, proofFor } from "./merkle.js";
+import { hashLeaf, buildTree, proofFor } from "./merkle.js";
+
+function randomBytes(n: number): Uint8Array {
+  const arr = new Uint8Array(n);
+  crypto.getRandomValues(arr);
+  return arr;
+}
```

`node:crypto` isn't available in browser bundles. Web Crypto's `crypto.getRandomValues()` is global in Node 20+ and the browser, so the SDK becomes truly cross-platform. Required for any web frontend (this repo) or mobile bundle to import the SDK.

---

## Working state

**Branch in this worktree:** `feature/dashboard-infographics` (commit `c007ae0`, 11 ahead of origin/main, **pushed to origin** as of 2026-05-09).
**Production branch:** `main` (commit `17a7c99`, 6 PRs merged).
**Worktree path:** `/Users/marwanchahboun/Desktop/tombola-frontend/.claude/worktrees/sad-davinci-1c0bfb`.

**Stack:**
- Next.js 15.5.18 (App Router, Webpack — Turbopack disabled at scaffold)
- React 19.1.0
- TypeScript strict, target ES2020 (BigInt literals)
- Tailwind CSS v4 (via `@import "tailwindcss"` in globals.css)
- @solana/wallet-adapter 0.15 + @solana/web3.js 1.98 (existing wallet boundary)
- @solana/kit 6.9 + @solana/web3-compat 0.0.21 + js-sha3 0.9
- Vitest 4 + @testing-library/react + happy-dom + @vitejs/plugin-react (47 tests)
- tsx 4.x (devDep, runs `.mts` scripts)
- GitHub Actions CI (`.github/workflows/ci.yml`) runs install + lint + test + build on every PR
- Hosted on Vercel free tier; auto-deploys main → `tombola-frontend-gamma.vercel.app`, branches → preview URLs

**Toolchain:**
- **Node 22.22.2 via nvm** (Node 24 breaks SDK ESM imports). `source $HOME/.nvm/nvm.sh && nvm use 22` before running scripts.
- npm
- gh CLI 2.92 — already authed as `AtlasBrain`

**Quickstart:**
```bash
cd ~/Desktop/tombola-frontend
npm run dev          # http://localhost:3000
npm run build        # production build sanity check
npm run test         # vitest run, single-shot for CI
npm run lint         # eslint
```

If `npm run dev` shows `Cannot find module './XXX.js'`, run `rm -rf .next` and retry (production-build artifacts confuse the dev server; happens any time you alternate `build` and `dev`).

---

## Architecture (current)

```
src/
  app/
    layout.tsx        Root layout — html.dark, body wraps children in <WalletProviders>
    page.tsx          Async server component. force-dynamic. Renders:
                      header (NetworkPill + WalletBalance + ConnectWalletButton)
                      → StatsBar → HowItWorks → PoolComparisonChart → main pool grid
                      → MyTickets → RecentWinners → FaqSection → footer.
                      Mounts <LivePoolWatcher> when source === "live".
    error.tsx         Client component (Next convention). Catches render errors
                      with Retry + Back to home. Logs digest to console.
    not-found.tsx     Server 404 page; matches dark aesthetic.
    pool/[type]/[round]/page.tsx
                      Pool detail page. Validates slug → poolType, calls
                      getPoolDetail (server). Stats card + buy card + ticket-
                      batches table (every TicketBatch in the round, sorted
                      by firstTicketId, buyer addresses link to explorer).
                      Force-dynamic, has its own LivePoolWatcher.
    globals.css       Tailwind v4 import + @theme binding for Geist font
  components/
    PoolCard.tsx      Server component. Group hover/focus states. "Round #N ·
                      explorer ↗" links to the pool's PDA. Kind heading is a
                      <Link> to /pool/<kind>/<round>. Slots BuyTicketButton +
                      WinOdds + FlashOnChange wrappers around POT and Tickets.
    BuyTicketButton.tsx     Client. useWallet + qty <input type=number> with
                            live cost preview ("= 0.05 SOL"). signTransaction
                            (sign-only) → connection.sendRawTransaction so
                            wallet-cluster mismatch doesn't matter. Pushes
                            success/error toasts.
    LivePoolWatcher.tsx     Client. Opens accountSubscribe per pool PDA via
                            createSolanaRpcSubscriptions. Debounces 300 ms then
                            router.refresh(). httpToWs() handles Solana's
                            port+1 quirk (8899 RPC → 8900 WS). Returns null.
    NetworkPill.tsx   Server (accepts optional rpcUrl prop for testability).
                      Cluster pill (localnet/devnet/testnet/mainnet). Rose
                      "⚠ insecure RPC" if mainnet over plain http.
    WalletBalance.tsx Client. 10s polling. formatSolCompact ("1.0 M SOL")
                      so a 1M-SOL test wallet doesn't render as a 7-digit
                      string.
    HowItWorks.tsx    Server. 3 numbered cards (Buy → Wait → Claim).
    FaqSection.tsx    Server. 5 questions in native <details>/<summary>.
    RecentWinners.tsx Server. Mock data; cards on mobile, table on desktop.
                      Currently displays mock-then-swap placeholder.
    StatsBar.tsx      Server. Aggregates total pot / tickets / active rounds /
                      next-close countdown across the 4 pools.
    PoolComparisonChart.tsx
                      Server. CSS-only column chart of the 4 pots; each
                      column links to that pool's detail page.
    WinOdds.tsx       Client. getProgramAccounts filtered by both pool +
                      owner; computes (userTickets / totalTickets) %.
                      Renders a thin emerald bar on each card when wallet
                      holds tickets in that round.
    MyTickets.tsx     Client. getProgramAccounts filtered by owner. Aggregates
                      by current-round pool. Renders nothing when wallet
                      absent or no batches.
    FlashOnChange.tsx Client. 28-line wrapper. useRef holds previous value;
                      changes flash text amber for 1.2 s, then fades back via
                      Tailwind transition-colors duration-700.
    Toast.tsx         Client. ToastProvider + useToast hook. Queue (max 4),
                      TTL 3.5 s, dismiss button, ARIA aria-live=polite.
    Countdown.tsx     Client. useEffect+setInterval, re-renders every 1 s.
    WalletProviders.tsx     ConnectionProvider + WalletProvider (wallets=[];
                            Wallet-Standard auto-discovery) + WalletModalProvider
                            + ToastProvider. Cluster from
                            NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet").
    ConnectWalletButton.tsx Client. dynamic(ssr:false) WalletMultiButton, dark
                            theme.
  lib/
    mock-pools.ts     PoolView type + 4 mock pools (offline fallback).
                      poolAddress optional; present on live data only.
    mock-winners.ts   WinnerView type + 6 mock entries.
    get-pools.ts      server-only. PoolTypeCounter → PublicPool for each type.
                      Maps SDK fields → PoolView, includes poolAddress for
                      explorer links + WinOdds query.
    get-pool-detail.ts server-only. Single-pool fetch + all batches
                      (getProgramAccounts memcmp on TicketBatch pool offset).
    kit-to-web3.ts    14-line client adapter. Maps kit AccountRole bits →
                      web3.js {isSigner, isWritable}.
    explorer-url.ts   Pure helpers. explorerAddressUrl + clusterLabelFor.
    format.ts         formatSol, formatSolCompact, formatCountdown,
                      formatTickets.
    *.test.ts(x)      Vitest unit + component tests (47 total).
  test-setup.ts       Registers @testing-library/jest-dom matchers + cleanup
                      between tests.
scripts/
  reset-localnet.sh        Full-reset orchestrator (kill validator → wipe →
                           restart → deploy → init protocol → init pools w/
                           test durations → optional 1M SOL transfer).
  init_pools_local.mts     Initializes 4 pools with test-friendly durations
                           (Weekly 10 min, Biweekly 14 d, etc). Imports SDK
                           by absolute path because tsx doesn't apply the
                           @tombola/sdk webpack alias.
  buy_test_ticket.mts      Sign with ~/.config/solana/id.json + send to
                           localnet — verifies phase 3+4 without wallet popup.
docs/design/
  redesign-v1.html         Metadrop-inspired mockup, lime green primary.
  palette-warm.html        Cream/burgundy/gold dark editorial palette.
  palette-purple.html      Solana-brand purple + aqua palette.
  palette-light.html       Cream paper bg + forest/terracotta editorial.
public/
  redesign-v1.html         Same files mirrored here so dev server (and Vercel)
  palette-warm.html        serves them at /redesign-v1.html etc.
  palette-purple.html
  palette-light.html
vendor/sdk/                Snapshot of ~/Desktop/Project Tombola/sdk/src for
                           Vercel builds. Re-sync via the recipe in
                           vendor/sdk/SNAPSHOT.md.
.github/workflows/ci.yml   GitHub Actions: install + lint + test + build on
                           every PR + push to main.
next.config.ts             webpack alias `@tombola/sdk` → vendor/sdk;
                           extensionAlias `.js → .ts`.
tsconfig.json              paths alias matches webpack alias.
vitest.config.ts           Vitest config: include *.test.ts(x), env happy-dom,
                           react plugin, @ + @tombola/sdk aliases, setupFiles.
.env.local                 NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
                           (gitignored by Next).
PLAN.md                    Implementation plan from the original localnet
                           pivot. Reference; archive when stable.
```

**Conventions:**
- Server components by default; `"use client"` only for state/effects/wallet adapter.
- `@/*` import alias resolves to `src/*`. `@tombola/sdk` resolves to `vendor/sdk/index.ts`.
- BigInt for all on-chain numeric types. Never `number` for lamports/tickets/round.
- Mock data shape matches on-chain shape (`PoolView` interface).
- All colours via Tailwind utilities; the body's `bg-neutral-950 text-neutral-100` owns the global theme.

---

## Optional follow-ups (none gating)

- **Real recent-winners** (~60 m) — replace `MOCK_WINNERS` with on-chain Resolved-state pools. Same mock-then-swap pattern. Requires actual draw cycles to have run (= Switchboard cloning OR devnet).
- **Vitest expansion** — component tests for `BuyTicketButton`'s click handler (full RaffleClient + connection mock), `LivePoolWatcher`'s WS lifecycle, integration tests for `get-pools.ts`.
- **Toast progress bar** — visual countdown on each toast tile.
- **Activity ticker on the home page** — animated marquee of recent buys (data already available via `getProgramAccounts`).
- **PLAN.md cleanup** — archive once design exploration concludes.

---

## Stop the validator (cleanup)

```bash
ps aux | grep solana-test-validator | grep -v grep
kill <PID>
solana config set --url devnet   # flip CLI back from localhost when done
```

---

## Suggested first messages for the next session

**Most likely path** — design exploration is in flight, palette decision pending:

> Resume from `SESSION_HANDOFF.md`. We're picking between four palette mockups in `public/palette-*.html` + `redesign-v1.html`. I want to lock in [palette-warm / palette-purple / palette-light / lime] and have you port it to the real React components in 2–3 PRs.

**If devnet SOL came through** (independent of design exploration):

> Resume from `SESSION_HANDOFF.md`. Devnet SOL is in the deployer keypair. Redeploy program to devnet + reinit protocol + init pools, then test wallet popup buy-ticket end-to-end via Phantom. Recipe is in this file under "wallet popup E2E status, escape hatch #1."

**If continuing optional polish**:

> Resume from `SESSION_HANDOFF.md`. Pick from "Optional follow-ups" — real winners swap, vitest expansion, or activity ticker.

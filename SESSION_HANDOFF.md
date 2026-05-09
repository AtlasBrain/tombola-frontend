# Session Handoff — Tombola Frontend

**Last updated:** 2026-05-09, end of design-exploration phase (active palette selection in progress).
**Read this file first when resuming.** Then `README.md` for the layout.

**Live URL:** https://tombola-frontend-gamma.vercel.app/
**Repo:** https://github.com/AtlasBrain/tombola-frontend (private, owner `AtlasBrain`)
**Companion repo (program + SDK):** https://github.com/AtlasBrain/Project-Tombola

---

## TL;DR for resume

The dapp is **fully functional on localnet** (live on-chain reads, buy-ticket via wallet, live WS updates, 47 unit/component tests, CI green on every PR). All 6 PRs from the implementation phase are merged to `main`.

The current activity is **design exploration**: the user is evaluating four distinct visual directions to replace the existing dark-emerald aesthetic. The exploration lives as standalone HTML mockups on a feature branch — **not yet ported to React**. The next session's job is most likely:

1. **Lock in a palette direction** (see "Active design decisions pending" below).
2. **Port the chosen design to React components** in a couple of incremental PRs.
3. *Optional:* tackle still-blocked items (Switchboard local cloning, devnet redeploy) when their gating conditions clear.

---

## Where we are

Web UI for the Tombola on-chain raffle protocol. **Phases 1–5 complete + 5 surfaced ideas + dashboard infographics + pool detail page + 18 component tests + CI workflow shipped to main.** The wallet-popup buy-ticket E2E loop remains gated by the wallet ecosystem (Phantom + Solflare dropped custom-RPC support in 2026); the underlying instruction-encoding/sign/send logic is verified via `scripts/buy_test_ticket.mts`.

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

Still **blocked** by the wallet ecosystem regression. Phantom Chrome dropped custom RPC URL config in 2025; Solflare also restricts to Mainnet/Testnet/Devnet. Backpack untested.

The wallet-adapter integration is correct: auto-discovery via Wallet Standard, kit→web3 adapter for sign-and-send. Hot-path verified by `scripts/buy_test_ticket.mts` (commit `5699504`). When devnet SOL flows again to the deployer keypair, the same flow runs unchanged on devnet and the wallet-popup loop works because Phantom/Solflare both speak devnet natively.

Three escape hatches when the user is ready:

1. **Move to devnet** (~30 min once SOL is in `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt`) — `solana program deploy --final` + `tsx scripts/deploy.ts devnet` + `tsx scripts/init_public_pools.ts devnet`. Then the live URL (point at `https://api.devnet.solana.com`) talks to devnet, Phantom too; both sides agree on the cluster. **Best path.**
2. **Mock Switchboard locally** (~4–8 h, real engineering) — stub program + test oracle daemon. Lets the draw cycle actually loop on local without touching the audited program. **Significant project.**
3. **Try Backpack** — last wallet that *might* still allow custom RPC. ~5 min check if user wants to validate.

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

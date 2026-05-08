# Session Handoff — Tombola Frontend

**Last updated:** 2026-05-08, end of phase 5 polish wave — all 7 original phase 5 items done plus 5 surfaced ideas (live WS updates, MyTickets panel, NetworkPill, Explorer links, error/404 pages).
**Read this file first when resuming.** Then `README.md` for the layout.

**Live URL:** https://tombola-frontend-gamma.vercel.app/
**Repo:** https://github.com/AtlasBrain/tombola-frontend (private, owner `AtlasBrain`)
**Companion repo (program + SDK):** https://github.com/AtlasBrain/Project-Tombola

---

## Where we are

Web UI for the Tombola on-chain raffle protocol. **Phases 1, 2, 6 done; phase 3 + 4 logic verified on localnet; phase 5 polish complete.** The single remaining gap is the wallet-popup buy-ticket E2E loop, blocked by the wallet ecosystem (Phantom + Solflare dropped custom RPC support in 2026).

| phase | what | status |
|---|---|---|
| 1 | visual shell with mocked pool data | ✅ commit `9babee1` |
| 2 | wallet connect (Phantom/Solflare/Backpack via Wallet Standard) | ✅ commit `352de5a` |
| theme fix | dropped `globals.css`'s body overrides | ✅ commit `000912f` |
| 6 | production deploy via Vercel | ✅ live |
| 3 | live on-chain reads via Tombola SDK | ✅ on localnet (commit `8762757`) |
| 4 | buy-ticket flow (instruction + adapter) | ✅ on localnet (commits `7d86c36` + `5699504`) |
| 4-UX | wallet popup → click → tx confirms | 🔒 blocked on wallet tooling (Phantom/Solflare dropped custom RPC) |
| 5 | polish — all 7 items (hover, How-it-works, FAQ, mobile, error, footer, recent winners) | ✅ commits `1c677ef` through `9b388e7` |
| 5+ | new ideas surfaced from pivot — explorer links, qty selector, WS updates, NetworkPill, MyTickets | ✅ commits `5b373e1`, `1cd411e`, `29e8a32`, `b4e51d1`, `584038b` |
| prod | re-run on devnet when SOL faucet cooperates | ⏭ |

**Branch:** `claude/sad-davinci-1c0bfb` (worktree branch, **18 commits ahead of `origin/main`, not pushed**). Decide before adding more: merge locally vs push-and-PR. Recent commits (most recent first):
```
584038b phase 5.9: MyTickets panel — show user's TicketBatch holdings
b4e51d1 phase 5.12: NetworkPill — cluster indicator + insecure-RPC warning
29e8a32 phase 5.10: live updates via accountSubscribe
9b388e7 phase 5.7: Recent winners mock section
1cd411e phase 5.8: quantity selector in BuyTicketButton (1–100, stepper)
f4e3a02 phase 5.3: FAQ accordion grounded in the threat model
3f559bd phase 5.5: app/error.tsx + app/not-found.tsx — crash hygiene
5e4323d phase 5.6: footer cleanup — program ID is now an explorer link
9fae40c phase 5.2: How it works — 3-step explainer above the pool grid
5b373e1 phase 5.11: Solana Explorer link on each PoolCard
9a8720a phase 5.4: mobile-responsive header — wallet button visible below sm
fa957df docs: SESSION_HANDOFF for localnet pivot + add PLAN.md
5699504 phase 4 verify: scripted buy-ticket smoke test on localnet
7d86c36 phase 4: buy-ticket button via wallet adapter + kit→web3 adapter
8762757 phase 3.2: live on-chain pool reads with mock fallback
131c336 phase 3.1: pull Tombola SDK into frontend via path alias
81179e6 chore(copy): drop stale "Phase 2" labels on PoolCard
1c677ef feat: phase 5 — hover/focus states on PoolCard
```

---

## Bring it back up (localnet recipe)

The `solana-test-validator` ledger is at `~/.tombola-localnet/test-ledger`. State is **wiped each restart** because `--reset` is in the launch command. Re-run all four bootstrap steps from a fresh validator.

**Prereqs to ensure:**
- Node 22.22.2 active (`source ~/.nvm/nvm.sh && nvm use 22`). Node 24 fails at SDK module-load due to ESM/CJS interop.
- Solana CLI 3.1.14 + Anchor 1.0.2 (already on this machine).
- The two SDK patches in `~/Desktop/Project Tombola/sdk/src/` are present (see "SDK patches" below).

**Step-by-step:**

```bash
# 1. Start the local validator (background)
mkdir -p ~/.tombola-localnet
cd ~/.tombola-localnet
solana-test-validator --reset --rpc-port 8899 > validator.log 2>&1 &
until solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; do sleep 1; done
until nc -z 127.0.0.1 8900; do sleep 1; done   # wait for WS too — scripts will hang otherwise
sleep 2

# 2. Configure CLI for localhost (this is global; flip back via `solana config set --url devnet` later)
solana config set --url http://127.0.0.1:8899
solana airdrop 100   # also pre-funded with ~500M SOL automatically

# 3. Deploy the program (already-built .so is committed)
solana program deploy --url http://127.0.0.1:8899 \
  '/Users/marwanchahboun/Desktop/Project Tombola/target/deploy/raffle.so'
# Expected program id: qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M

# 4. Initialize ProtocolConfig (one-time)
cd '/Users/marwanchahboun/Desktop/Project Tombola'
DEPLOYER=$(solana address)
RAFFLE_TREASURY=$DEPLOYER RAFFLE_VRF_ORACLE=$DEPLOYER \
  ./node_modules/.bin/tsx scripts/deploy.ts localnet

# 5. Initialize the four public pools.
#    NOTE: scripts/init_public_pools.ts crashes mid-loop on local-validator WS race
#    after Weekly succeeds. Solution: write a one-off init for the remaining 3
#    that uses RPC polling instead of WS confirmations (see commit body of 5699504
#    or the throwaway script we wrote at /tmp during the pivot — pattern is in
#    scripts/buy_test_ticket.mts).
./node_modules/.bin/tsx scripts/init_public_pools.ts localnet --day0 2026-05-11
# (Will fail at Biweekly with WS error; Weekly will be initialized.
# Init the rest manually via a similar polling script.)

# 6. Frontend (in this repo)
cd ~/Desktop/tombola-frontend       # or worktree path
npm run dev                          # picks NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899 from .env.local
```

After step 6, hit `http://localhost:<port>` — pool cards render with **live — localnet** badge.

**Smoke-test buy ticket (no wallet popup):**
```bash
npx tsx scripts/buy_test_ticket.mts                      # 1 Weekly ticket (default)
npx tsx scripts/buy_test_ticket.mts --pool=2 --qty=3     # 3 Triweekly tickets
```
Refresh dapp → card shows updated tickets + pot.

---

## Wallet popup E2E status

**Blocked**, not by us, by the wallet ecosystem.

- **Phantom** Chrome extension dropped custom RPC URL config in 2025. Developer Settings has a Testnet Mode toggle but no override field — points at Solana's official devnet only.
- **Solflare** also restricts network to Mainnet/Testnet/Devnet — no custom RPC.
- **Backpack** is the remaining candidate worth trying; not validated yet.

The wallet adapter code is correct (auto-discovery via Wallet Standard, kit→web3 adapter for sign-and-send). Hot-path verified by the scripted smoke test (commit `5699504`). When devnet SOL becomes available, the same flow runs unchanged on devnet and the wallet popup loop works there because Phantom/Solflare both speak devnet natively.

---

## SDK patches needed in companion repo

Two real bugs surfaced when running the SDK outside vitest. Both are one-liners and live in `~/Desktop/Project Tombola/sdk/src/`. **Review and commit them in your audit-ready repo** (run the hygiene gate after).

### 1. `merkle.ts:11`

```diff
-import { keccak_256 } from "js-sha3";
+import sha3 from "js-sha3";
+const { keccak_256 } = sha3;
```

**Why:** `js-sha3` is CJS with `module.exports = methods` (runtime assignment). Node 22+ ESM strict loader can't synthesize the `keccak_256` named export from that. Vitest's loader is looser, so unit tests pass — but `tsx scripts/deploy.ts` and any browser bundle hit it immediately.

The matching test file `merkle.test.ts:2` has the same import; backport the fix.

### 2. `codes.ts:10`

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

**Why:** `node:crypto` isn't available in browser bundles. Web Crypto's `crypto.getRandomValues()` is a global in both Node 20+ and the browser, so the SDK becomes truly cross-platform with this change. Required for any web frontend (this repo) or mobile bundle to import the SDK.

---

## Working state

**Branch:** `claude/sad-davinci-1c0bfb` (worktree branch). Working tree should be clean — verify with `git status`.

**Stack:**
- Next.js 15.5.18 (App Router, Webpack — Turbopack disabled at scaffold)
- React 19.1.0
- TypeScript strict, target ES2020 (BigInt literals)
- Tailwind CSS v4 (via `@import "tailwindcss"` in globals.css)
- @solana/wallet-adapter 0.15 + @solana/web3.js 1.98 (existing wallet boundary)
- @solana/kit 6.9 + @solana/web3-compat 0.0.21 + js-sha3 0.9 (added in phase 3.1)
- tsx 4.x (devDep, runs `.mts` scripts)
- Hosted on Vercel free tier

**Toolchain:**
- **Node 22.22.2 via nvm** (Node 24 breaks SDK ESM imports). `source $HOME/.nvm/nvm.sh && nvm use 22` before running scripts.
- npm (no yarn workspace; flat `package.json`)
- gh CLI 2.92 at `~/.local/bin/gh` — already authed as `AtlasBrain`

**Quickstart:**
```bash
cd ~/Desktop/tombola-frontend
npm run dev          # http://localhost:3000 (or auto-assigned)
npm run build        # production build sanity check
npm run lint         # eslint
```

If `npm run dev` shows `Cannot find module './XXX.js'`, run `rm -rf .next` and retry (production-build artifacts confuse the dev server). Hit this every time you `npm run build` then `npm run dev`.

---

## Architecture (current)

```
src/
  app/
    layout.tsx        Root layout — html.dark, body wraps children in <WalletProviders>
    page.tsx          Async server component. force-dynamic. Calls getLivePools() with
                      MOCK_POOLS fallback. Composes the page sections in order: header
                      (NetworkPill + ConnectWalletButton stacked) → HowItWorks → main
                      pool grid → MyTickets → RecentWinners → FaqSection → footer.
                      Mounts <LivePoolWatcher> when source === "live".
    error.tsx         Client component (Next convention). Catches render errors with
                      Retry + Back to home. Logs digest to console.
    not-found.tsx     Server 404 page; matches dark aesthetic.
    globals.css       Tailwind v4 import + @theme binding for Geist font
  components/
    PoolCard.tsx      Server component. Group hover/focus states. "Round #N · explorer ↗"
                      links to the pool's PDA on the cluster's explorer. Slots
                      BuyTicketButton.
    BuyTicketButton.tsx     Client. useWallet → buyTicketPublic ix → kit→web3 convert
                            → wallet.sendTransaction. Quantity stepper [-] N [+] (1–100);
                            cost label updates live ("Buy — 0.05 SOL"). No router.refresh
                            here — LivePoolWatcher does it.
    LivePoolWatcher.tsx     Client. Opens accountSubscribe per pool PDA via
                            createSolanaRpcSubscriptions. Debounces 300 ms then
                            router.refresh(). httpToWs() handles Solana's port+1 quirk
                            (8899 RPC → 8900 WS). Returns null.
    NetworkPill.tsx   Server. Cluster pill (localnet/devnet/testnet/mainnet) above
                      the wallet button. Rose "⚠ insecure RPC" if mainnet over plain
                      http. Tooltip = full RPC URL.
    HowItWorks.tsx    Server. Three numbered cards (Buy → Wait → Claim), grid-cols-1
                      md:grid-cols-3.
    FaqSection.tsx    Server. 5 questions in native <details>/<summary> — no JS,
                      accessible, server-rendered. Plus icon rotates on open.
    RecentWinners.tsx Server. Mock data; dual layout (cards on mobile, table on
                      desktop). Tagged "mock — Phase 7" with the amber pill.
    MyTickets.tsx     Client. useWallet → getProgramAccounts(PROGRAM_ID, [
                      {dataSize: 89}, {memcmp: {offset: 40, bytes: owner}}]) →
                      decode TicketBatch → aggregate by current-round pool. Renders
                      nothing when wallet absent or no batches. Live-updates because
                      pools prop changes when LivePoolWatcher fires.
    Countdown.tsx     Client. useEffect+setInterval, re-renders every 1s.
    WalletProviders.tsx     ConnectionProvider + WalletProvider (wallets=[];
                            Wallet-Standard auto-discovery) + WalletModalProvider.
                            Cluster: NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet").
    ConnectWalletButton.tsx Client. dynamic(ssr:false) WalletMultiButton, dark theme.
  lib/
    mock-pools.ts     PoolView type + 4 mock pools (offline fallback). poolAddress is
                      optional — present on live data, undefined on mocks. Shape mirrors
                      on-chain PublicPool (D-058).
    mock-winners.ts   WinnerView type + 6 mock entries spanning all 4 pool kinds.
    get-pools.ts      server-only. Reads PoolTypeCounter then PublicPool for each type.
                      Computes pool PDA via client.publicPoolPda — surfaces it on
                      PoolView so explorer links and MyTickets can use it without
                      re-deriving.
    kit-to-web3.ts    14-line client adapter. Maps kit AccountRole bits → web3.js
                      {isSigner, isWritable}.
    explorer-url.ts   Pure helpers. explorerAddressUrl(addr, rpcUrl) builds cluster-
                      aware explorer URLs (localhost → cluster=custom + customUrl).
                      clusterLabelFor(rpcUrl) returns "localnet"|"devnet"|"testnet"|
                      "mainnet" for the NetworkPill.
    format.ts         formatSol, formatCountdown, formatTickets.
scripts/
  buy_test_ticket.mts     tsx-runnable smoke test. Signs with ~/.config/solana/id.json
                          and sends a buy_ticket_public tx straight at localnet. Used
                          to verify phases 3+4 without depending on wallet popup UX.
next.config.ts        webpack alias `@tombola/sdk` → ../../../../Project Tombola/sdk/src;
                      extensionAlias `.js → .ts` so TS-ESM imports resolve.
tsconfig.json         paths alias matches webpack alias for type checking.
.env.local            NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899 (gitignored by Next).
PLAN.md               Implementation plan that drove this pivot (kept for reference;
                      can be archived/deleted now).
```

**Conventions:**
- Server components by default; `"use client"` only for state/effects/wallet adapter.
- `@/*` import alias resolves to `src/*`. `@tombola/sdk` resolves to the companion repo's SDK source.
- BigInt for all on-chain numeric types (`totalPotLamports`, `round`, etc.). Never `number`.
- Mock data shape MUST match on-chain shape — `getLivePools` decodes SDK output into the same `PoolView` interface so the cards don't care which source is feeding them.
- All colours via Tailwind utilities; the body's `bg-neutral-950 text-neutral-100` owns the global theme. Don't add a `body { background: ... }` rule in `globals.css` — that's the trap from commit `000912f`.

---

## What's left to do

**Branch hygiene (do first):**
- Decide merge path for `claude/sad-davinci-1c0bfb` — 18 commits ahead of main. Either `git merge` locally or push and open a PR. Don't keep accumulating without choosing.
- **Companion repo SDK patches** are uncommitted on `~/Desktop/Project Tombola/sdk/src/{merkle,codes}.ts`. Run the program-repo hygiene gate (`cargo test`, `vitest`, `prettier --check`) and commit those before any other SDK consumer (mobile, etc.) hits the same bug.

**Wallet popup E2E (blocked):**
- Test buy-ticket via Phantom/Solflare/Backpack popup once a wallet supports custom RPC again **OR** when devnet SOL is back in the deployer keypair (then re-run the localnet recipe pointed at devnet — see "Bring it back up" but swap `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com` and `solana config set --url devnet`). All UI/UX is wired; this is purely a validation pass.

**Optional next features (none gating):**
- **#13 Toast on tx confirm** (~30m) — when LivePoolWatcher fires after the user's own buy, surface "1 ticket landed" instead of silently updating.
- **#14 Real recent-winners** (~60m) — replace `MOCK_WINNERS` with on-chain Resolved-state pools. Same mock-then-swap pattern. Requires actual draw cycles to have run, which means Switchboard cloning on local OR running on devnet with VRF.
- **Vitest setup + first unit tests** — CLAUDE.md says "vitest goes in when phase 3 lands" — phase 3 has landed. Candidates for unit tests: `lib/explorer-url.ts` (pure), `lib/format.ts` (pure), `lib/kit-to-web3.ts` (role-bit mapping), `lib/get-pools.ts` (mock RPC).
- **Decide on PLAN.md** — was the implementation plan for the localnet pivot. Could be moved to a `docs/` archive or deleted; it's not load-bearing.

---

## Stop the validator (cleanup)

```bash
# Find PID
ps aux | grep solana-test-validator | grep -v grep
# Then:
kill <PID>
# Or to wipe state without restart:
rm -rf ~/.tombola-localnet/test-ledger
```

The CLI's `solana config` is still pointed at localhost — flip back when done:
```bash
solana config set --url devnet
```

---

## Suggested first message in the next session

If branch is still unmerged (most likely):

> Resume from `SESSION_HANDOFF.md`. Phase 5 polish wave is done (18 commits on `claude/sad-davinci-1c0bfb`). Decide merge path: local merge to `main` or push + PR. Then do the companion-repo SDK patch commits.

Once branch is merged and you have devnet SOL:

> Resume from `SESSION_HANDOFF.md`. Set `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com` and run `solana config set --url devnet`. Redeploy program + reinit pools on devnet (recipe in this file but swap the cluster arg). Then test wallet popup buy-ticket end-to-end via Phantom.

If you want to keep building features without merging:

> Resume from `SESSION_HANDOFF.md`. Pick from "Optional next features" — toast on tx confirm, vitest setup, or real recent-winners.

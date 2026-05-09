# Devnet Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the live Tombola dapp from localnet (where Phantom popups are blocked because browser extensions dropped custom-RPC support in 2026) to **devnet**, so the deployed Vercel URL becomes a real end-to-end demo: open page → connect Phantom → buy ticket → tx lands in Solscan. Do this without breaking the existing localnet recipe (additive — both clusters work after this).

**Architecture:** Three things change. (1) The on-chain Anchor program from `~/Desktop/Project Tombola` gets deployed to devnet using its existing keypair (`raffle-keypair.json` → preserves the program ID `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M`, so the vendored SDK needs zero changes). (2) The 4 pools (Weekly / Biweekly / Triweekly / Monthly) get re-initialized on devnet via a small adaptation of `scripts/init_pools_local.mts`. (3) Frontend env vars on local + Vercel switch from localhost to a Helius devnet RPC (public `api.devnet.solana.com` rate-limits will flap the live polling).

**Tech Stack:** Existing — Anchor 0.31, Solana CLI, `@solana/wallet-adapter` (already devnet-aware), Helius free RPC tier (100k req/day · sufficient for the live dapp), `tsx` for the `.mts` init script.

**Source of truth:**
- Program: `~/Desktop/Project Tombola/programs/raffle/src/lib.rs` (`declare_id!("qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M")`)
- Existing localnet init script: `scripts/init_pools_local.mts` — copy + retarget for devnet
- Existing env var pattern: `process.env.NEXT_PUBLIC_SOLANA_RPC_URL` (already wired throughout `src/app/`, `src/components/`)
- Wallet to fund pools/buys (UI-side): `A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY` (Phantom · 1 SOL on devnet, [Solscan](https://solscan.io/account/A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY?cluster=devnet))
- CLI keypair (deploy + init signer): `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt` (default `~/.config/solana/id.json` · empty on devnet — Stage 0 funds it)

---

## Cost budget

| Operation | Approximate SOL on devnet |
|---|---|
| Program deploy (470 728 bytes `.so`) | ~3.3 |
| Program data account rent (one-time) | included above |
| Tombola protocol PDA init | ~0.005 |
| 4 pool PDAs init (Weekly + Biweekly + Triweekly + Monthly) | ~0.02 |
| Switchboard On-Demand subscription deposit (per pool, optional for buy E2E) | ~0.05 |
| One ticket buy (gas + 0.01 SOL ticket) | ~0.011 |
| **Total to bootstrap deploy + init** | **~3.5 SOL** |
| **Total once running, per buy** | **~0.011** |

CLI keypair needs ~3.5 SOL to bootstrap. After that, most ongoing activity happens from Phantom (UI buy flow). Plan first task: **fund the CLI keypair**.

---

## File Structure

**New files:**
- `scripts/init_pools_devnet.mts` — devnet variant of the existing `init_pools_local.mts`
- `.env.local` (local dev only — gitignored, **don't commit**) — `NEXT_PUBLIC_SOLANA_RPC_URL=...`

**Modified files:**
- `SESSION_HANDOFF.md` — replace "wallet popup blocked" status with devnet recipe
- `README.md` — add a **Devnet bring-up** section parallel to the existing localnet one
- `package.json` — add `init:devnet` script alongside the existing `init:local`

**Untouched:**
- All `src/components/`, `src/lib/`, `src/app/` — env var already wired
- `vendor/sdk/` — program ID is the same, no SDK rebuild needed
- Existing `scripts/init_pools_local.mts` and `scripts/reset-localnet.sh` — kept as-is for offline iteration

---

## Stage 0 — Prerequisites

### Task 0.1: Get a Helius devnet RPC URL

Public devnet RPC (`api.devnet.solana.com`) caps at ~10 req/s and will flap the dapp's polling. Helius free tier (100k req/day, no credit card) handles the live load.

- [ ] **Step 1: Sign up for Helius** *(USER ACTION)*

Open https://dashboard.helius.dev/signup. Create a free account. Create one project (e.g. "tombola"). Copy the devnet RPC URL — looks like `https://devnet.helius-rpc.com/?api-key=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`.

- [ ] **Step 2: Smoke-test the RPC**

Run:
```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  '<HELIUS_DEVNET_URL>'
```
Expected: `{"jsonrpc":"2.0","result":"ok","id":1}`.

If you get rate-limited or 403, double-check the URL (free tier still works on devnet — only mainnet has commercial gating).

- [ ] **Step 3: Save the URL for later**

Set as a shell var so subsequent steps can reference it:
```bash
export HELIUS_DEVNET="https://devnet.helius-rpc.com/?api-key=XXXXXXXX-..."
```

(No commit; no file change here yet.)

---

### Task 0.2: Fund the CLI keypair on devnet (~3.5 SOL needed)

The CLI keypair (`EaALFp4Z...`) signs `anchor deploy` + the init script. Currently has 0 SOL on devnet. Two paths to fill it.

- [ ] **Step 1: Check current balance**

Run:
```bash
solana balance EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt --url "$HELIUS_DEVNET"
```
Expected: `0 SOL`. (If non-zero — skip to Stage 1.)

- [ ] **Step 2: Fund — Path A (Helius faucet, fastest)**

Open https://www.helius.dev/faucet (logged in, free tier).
- Address: `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt`
- Amount: 5 SOL
- Submit. Wait ~5 seconds.

- [ ] **Step 3: Fund — Path B (CLI airdrop, if Path A fails)**

```bash
solana airdrop 2 EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt --url "$HELIUS_DEVNET"
# repeat 2x more if you only get 1 SOL each time
```

If still rate-limited: try https://faucet.quicknode.com (5 SOL/day, no signup) or https://faucet.solana.com (UI, 1 SOL each).

- [ ] **Step 4: Verify funded**

```bash
solana balance EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt --url "$HELIUS_DEVNET"
```
Expected: ≥ 3.5 SOL. **Don't proceed to Stage 1 until this passes** — partial deploy on insufficient balance leaves an orphan buffer account that's painful to recover.

---

## Stage 1 — Deploy the program to devnet

### Task 1.1: Build the program (if not already built)

- [ ] **Step 1: Verify the `.so` exists**

```bash
ls -la "/Users/marwanchahboun/Desktop/Project Tombola/target/deploy/raffle.so"
```
Expected: file exists, ~470 KB.

If missing or stale (lib.rs newer than the .so):
```bash
cd "/Users/marwanchahboun/Desktop/Project Tombola"
anchor build
```
Expected: `target/deploy/raffle.so` regenerated.

- [ ] **Step 2: Verify the keypair**

```bash
ls -la "/Users/marwanchahboun/Desktop/Project Tombola/target/deploy/raffle-keypair.json"
solana address -k "/Users/marwanchahboun/Desktop/Project Tombola/target/deploy/raffle-keypair.json"
```
Expected: `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M` (matches `declare_id!()` in `lib.rs:11`).

If output differs — the keypair drifted. STOP and investigate (`grep declare_id programs/raffle/src/lib.rs`).

---

### Task 1.2: Deploy

- [ ] **Step 1: Deploy via Solana CLI**

`anchor deploy` is a wrapper around `solana program deploy`. Going direct so we get explicit RPC control:

```bash
cd "/Users/marwanchahboun/Desktop/Project Tombola"
solana program deploy \
  --program-id target/deploy/raffle-keypair.json \
  --keypair ~/.config/solana/id.json \
  --url "$HELIUS_DEVNET" \
  target/deploy/raffle.so
```

Expected output (takes ~30–90 seconds):
```
Program Id: qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M
Signature:  <some sig>
```

- [ ] **Step 2: If the deploy fails mid-flight**

Common failure: `Error: Custom program error: 0x1` (insufficient lamports for buffer rent), or RPC timeout.

- Check buffer accounts: `solana program show --buffers --keypair ~/.config/solana/id.json --url "$HELIUS_DEVNET"`
- Resume: `solana program deploy ... --buffer <BUFFER_ACCOUNT_FROM_ABOVE>`
- Or close stale buffers to recover the rent: `solana program close <BUFFER_ACCOUNT> --keypair ~/.config/solana/id.json --url "$HELIUS_DEVNET"`

- [ ] **Step 3: Verify on Solscan**

Open https://solscan.io/account/qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M?cluster=devnet
Expected: page loads, "Owner: BPFLoaderUpgradeable", "Executable: Yes", "Last Update Slot" = recent.

- [ ] **Step 4: Verify via SDK from the frontend repo**

```bash
cd /Users/marwanchahboun/Desktop/tombola-frontend/.claude/worktrees/sad-davinci-1c0bfb
node -e '
const { Connection, PublicKey } = require("@solana/web3.js");
const c = new Connection(process.env.HELIUS_DEVNET);
c.getAccountInfo(new PublicKey("qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M"))
  .then(a => console.log(a ? `executable=${a.executable} owner=${a.owner.toBase58()}` : "NOT FOUND"));'
```
Expected: `executable=true owner=BPFLoaderUpgradeab1e11111111111111111111111`.

---

## Stage 2 — Init the protocol + 4 pools on devnet

### Task 2.1: Adapt the local init script for devnet

**Files:**
- Create: `scripts/init_pools_devnet.mts` (copy of `scripts/init_pools_local.mts` with RPC URL change + comment header refresh)

- [ ] **Step 1: Read the existing local script**

Run:
```bash
wc -l scripts/init_pools_local.mts
head -40 scripts/init_pools_local.mts
```
Note any hardcoded `localhost:8899` references and the structure of pool config (Weekly / Biweekly / Triweekly / Monthly).

- [ ] **Step 2: Copy + retarget**

```bash
cp scripts/init_pools_local.mts scripts/init_pools_devnet.mts
```

Then open `scripts/init_pools_devnet.mts`. Three edits:

1. Update the file-header comment from "Requires: validator running on localhost:8899" → "Requires: program deployed to devnet, signer keypair has ~0.05 SOL on devnet."
2. Replace any hardcoded `http://localhost:8899` (and ws variant `ws://localhost:8900`) with `process.env.HELIUS_DEVNET ?? "https://api.devnet.solana.com"`.
3. If the script imports the SDK by absolute path (likely), no change needed — SDK has the same program ID for devnet.

Expected diff between the two files: ~5–10 lines.

- [ ] **Step 3: Add npm run target**

Open `package.json`. Find the `"scripts": { ... }` block. Add a sibling to `init:local`:

```json
"init:devnet": "tsx scripts/init_pools_devnet.mts",
```

Verify with: `cat package.json | grep init:` — expected: both `init:local` and `init:devnet` present.

- [ ] **Step 4: Commit**

```bash
git add scripts/init_pools_devnet.mts package.json
git commit -m "feat(devnet): init script + npm target for devnet pool bring-up"
```

---

### Task 2.2: Run init on devnet

- [ ] **Step 1: Sanity-check signer balance**

```bash
solana balance --url "$HELIUS_DEVNET"
```
Expected: ≥ 0.05 SOL remaining (after the deploy). If not, top up via Helius faucet (Task 0.2 Step 2).

- [ ] **Step 2: Run init**

```bash
HELIUS_DEVNET="$HELIUS_DEVNET" npm run init:devnet
```

Expected (script output, takes ~10 seconds):
```
[init] connecting to https://devnet.helius-rpc.com/?...
[init] signer: EaALFp4Z...
[init] tombola protocol PDA: <PDA-1>     status=already-initialized | created
[init] pool Weekly:    <PDA-2>           created  round 1  duration 7d
[init] pool Biweekly:  <PDA-3>           created  round 1  duration 14d
[init] pool Triweekly: <PDA-4>           created  round 1  duration 21d
[init] pool Monthly:   <PDA-5>           created  round 1  duration 30d
[init] done
```

If you see "already-initialized" for the protocol PDA, that's fine (deploys leave the PDA intact). If a pool fails to init: read the error, fix the input, re-run — script is idempotent for already-existing pools.

- [ ] **Step 3: Verify pools via SDK**

```bash
node -e '
const { Connection, PublicKey } = require("@solana/web3.js");
const c = new Connection(process.env.HELIUS_DEVNET);
c.getProgramAccounts(new PublicKey("qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M"))
  .then(a => console.log(`Found ${a.length} program-owned accounts on devnet`));'
```
Expected: ≥ 5 (1 protocol + 4 pools), might be more if the script also creates draw subaccounts.

---

## Stage 3 — Frontend env: local + Vercel

### Task 3.1: Local dev

- [ ] **Step 1: Add `.env.local`**

Create `/Users/marwanchahboun/Desktop/tombola-frontend/.claude/worktrees/sad-davinci-1c0bfb/.env.local`:

```
NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

(Use your real Helius URL.)

`.env.local` is gitignored by Next.js's defaults (verify with `git check-ignore -v .env.local`). **Don't commit this file.**

- [ ] **Step 2: Restart dev server**

If a dev server is already running, kill it and restart so it picks up the new env var:
```bash
# Kill if running
# (or via the preview MCP — preview_stop)
npm run dev
```

- [ ] **Step 3: Verify the page loads from devnet**

Open http://localhost:3000/. Open browser DevTools → Network tab. Filter to `helius`.

Expected: pool fetch hits `devnet.helius-rpc.com/...` (not localhost). The 4 pools render with **devnet** data — round numbers / pots may differ from what you saw on localnet because they're fresh.

The `NetworkPill` in the header should show "DEVNET" (not "LOCALNET").

---

### Task 3.2: Vercel env

- [ ] **Step 1: Open Vercel project settings** *(USER ACTION)*

https://vercel.com/atlasbrains-projects/tombola-frontend/settings/environment-variables

- [ ] **Step 2: Add or update `NEXT_PUBLIC_SOLANA_RPC_URL`**

- Key: `NEXT_PUBLIC_SOLANA_RPC_URL`
- Value: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`
- Environment: **Production, Preview, Development** (all three)
- Save

- [ ] **Step 3: Redeploy**

Trigger a redeploy from the Vercel dashboard (Deployments → latest → ⋯ → Redeploy) OR push any commit to the active branch (auto-deploys).

Easiest: just push the in-progress redesign branch — the Vercel build will pick up the new env var:
```bash
git push  # triggers Vercel preview build with the new env
```

- [ ] **Step 4: Verify**

Wait ~90 seconds for the build. Open the Vercel preview URL (or production URL if `main`). Network tab should show `helius-rpc.com` requests, not localhost. NetworkPill: "DEVNET".

---

## Stage 4 — End-to-end verification

### Task 4.1: Phantom on devnet

- [ ] **Step 1: Switch Phantom to devnet** *(USER ACTION)*

Phantom extension → settings (gear) → Developer Settings → "Testnet mode" ON → Solana network: **Devnet**.

- [ ] **Step 2: Confirm balance**

In Phantom, the active wallet (`A9xZTBN7...`) should show **1 SOL** on devnet (matches Solscan).

---

### Task 4.2: Buy a ticket via the UI

- [ ] **Step 1: Open the deployed (or local) frontend**

Choose one:
- Local: http://localhost:3000/
- Vercel: https://tombola-frontend-gamma.vercel.app/ (after Stage 3.2 redeploy completes)

- [ ] **Step 2: Connect Phantom**

Click CONNECT → choose Phantom → approve. Wallet adapter should show the truncated address `A9xZ...CDWY` in the header.

- [ ] **Step 3: Buy 1 ticket on Weekly**

Scroll to the Weekly pool card. Click BUY 1 TICKET (cost: 0.01 SOL).

Phantom popup should appear asking to confirm the transaction. Approve.

- [ ] **Step 4: Confirm tx lands**

Within ~5 seconds:
- A toast should appear with the tx signature
- The Weekly pool card's "TICKETS" stat should increment by 1
- The "POT" stat should increase by 0.01 SOL

If it doesn't increment within 30s — open browser console for error logs; check the tx signature on Solscan: `https://solscan.io/tx/<sig>?cluster=devnet`.

- [ ] **Step 5: Verify on Solscan**

Open https://solscan.io/account/A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY?cluster=devnet
Expected: a recent SOL Transfer (-0.01) listed in the activity, with the recipient = the Weekly pool PDA.

---

## Stage 5 — Documentation refresh

### Task 5.1: Update SESSION_HANDOFF.md

**Files:**
- Modify: `SESSION_HANDOFF.md`

- [ ] **Step 1: Replace the "wallet popup blocked" section**

Open `SESSION_HANDOFF.md`. Find the line(s) describing the wallet popup as blocked. Replace with:

```markdown
**Wallet popup E2E:** ✅ Working on devnet. Phantom (built-in devnet support) signs and broadcasts cleanly. Live recipe in README → "Devnet bring-up". Localnet path preserved for offline iteration but no longer the canonical demo target.
```

- [ ] **Step 2: Update "Where we are" status row**

If the table has a row "wallet popup → click → tx confirms — 🔒 blocked", flip the icon to ✅ and the cluster to devnet.

- [ ] **Step 3: Add a "Devnet" entry to the architecture / cluster table**

Below any existing localnet recipe block, add:

```markdown
**Devnet (canonical demo target):**
- RPC: Helius free tier (`https://devnet.helius-rpc.com/?api-key=...`)
- Signer (deploy + init): `EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt` (CLI keypair)
- Wallet (UI buy flow): `A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY` (Phantom)
- Program ID: same as localnet — `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M`
- Bring-up: see README "Devnet bring-up"
```

- [ ] **Step 4: Commit**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs(handoff): devnet is the canonical cluster · wallet popup E2E unblocked"
```

---

### Task 5.2: Add a Devnet recipe to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Devnet bring-up" section**

Under the existing "Localnet bring-up" (or next to it), add:

```markdown
## Devnet bring-up

One-time setup. After this, the deployed Vercel URL is a real demo (connect Phantom on devnet → buy ticket → confirm in Solscan).

1. **Get a Helius devnet RPC key** — https://dashboard.helius.dev (free, 100k req/day).
2. **Fund the CLI keypair** (~3.5 SOL needed for deploy + init):
   ```bash
   solana balance --url "$HELIUS_DEVNET"   # check
   # Top up via https://www.helius.dev/faucet (5 SOL one-shot, easiest)
   # or `solana airdrop 2 <addr> --url "$HELIUS_DEVNET"` (rate-limited)
   ```
3. **Deploy program** from companion repo:
   ```bash
   cd "/Users/marwanchahboun/Desktop/Project Tombola"
   solana program deploy --program-id target/deploy/raffle-keypair.json \
     --keypair ~/.config/solana/id.json --url "$HELIUS_DEVNET" \
     target/deploy/raffle.so
   ```
   Program ID: `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M` (same as localnet — the keypair is reused).
4. **Init the 4 pools**:
   ```bash
   cd ~/Desktop/tombola-frontend
   HELIUS_DEVNET="..." npm run init:devnet
   ```
5. **Wire the frontend env**:
   - Local: create `.env.local` with `NEXT_PUBLIC_SOLANA_RPC_URL=<HELIUS_URL>`.
   - Vercel: same env var on the project settings page; redeploy.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): devnet bring-up recipe"
```

---

## Stage 6 — Push + verify

### Task 6.1: Push everything

- [ ] **Step 1: Push the branch**

```bash
git push
```
Expected: 5 commits land on `feature/dashboard-infographics` (init script + package.json, plus the 2 docs commits, plus any others from earlier tasks).

- [ ] **Step 2: Watch the Vercel deploy**

Wait ~90s. Open the latest preview URL.

- [ ] **Step 3: Repeat E2E from Stage 4 against the Vercel preview**

Same checklist. Confirm wallet popup, sign, ticket lands.

If everything passes — devnet migration complete. Run the redesign plan (`docs/superpowers/plans/2026-05-09-redesign-v1-recolored-port.md`) next.

---

## Self-Review Checklist

1. **Spec coverage** — every cost line in the budget table has a corresponding fund / deploy / init / verify task. ✓
2. **No placeholders** — every command is fully specified with the right path / address / RPC URL placeholder. ✓
3. **Type consistency** — same program ID across localnet and devnet (the keypair is reused). SDK doesn't need a rebuild. ✓

**Risk areas:**
- **Helius free tier rate limit** — 100k req/day is plenty for one user. If multiple developers hit the same key, upgrade or rotate.
- **Public faucet flakiness** — Stage 0 Task 0.2 Path A vs B vs C. Helius faucet is the most reliable in 2026; CLI airdrops have been throttled hard since Q3 2024.
- **Buffer-account orphan on failed deploy** — Stage 1 Task 1.2 Step 2 documents the recovery flow. Don't ignore that step if `solana program deploy` errors.
- **Switchboard On-Demand for the draw** — out of scope for this plan. Buy-ticket E2E doesn't need Switchboard. The actual `runDrawCycle` instruction is operator-side and handled separately when you do a full demo. Note: Switchboard requires a small SOL deposit per pool when the operator first calls `request_randomness`. Plan to set aside ~0.2 SOL extra in the CLI keypair if you'll demo the draw step.

---

## Execution Notes

- ~5 tasks, ~3 hours of focused work.
- Stages 0 → 1 → 2 are sequential.
- Stage 3 can be partially done in parallel (Vercel env update can happen while Stage 2 init runs).
- Stage 4 is the proof — don't skip it.
- Stages 5 + 6 are admin / documentation. Can be one combined commit if preferred.

---

**Plan complete.** Execute via subagent-driven-development OR inline executing-plans.

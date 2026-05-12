# Admin Dashboard — Architecture Proposal

**Author:** founder review pass · 2026-05-12
**Status:** awaiting approval before implementation
**Scope:** internal-only operator console for Tombola

This document is the pre-implementation deliverable. Six sections:

1. [Architecture recommendation — where the dashboard lives](#1-architecture-recommendation)
2. [Data model / API audit — what exists vs what's missing](#2-data-model--api-audit)
3. [Access control — admin authentication & RBAC](#3-access-control)
4. [Metric inventory — every requested metric mapped to a source](#4-metric-inventory)
5. [Protocol wallet — fee mechanics & safe cash-out](#5-protocol-wallet)
6. [Phased implementation plan](#6-phased-implementation-plan)

Mockups (open in a browser):

- `docs/design/mockups/admin-1-executive.html` — high-level KPIs
- `docs/design/mockups/admin-2-users.html` — user search + drill-down
- `docs/design/mockups/admin-3-pools.html` — pool monitoring + risk

---

## 1. Architecture recommendation

**Recommendation: build inside the existing frontend repo (`tombola-frontend`), at the route prefix `/admin/*`, gated by an `ADMIN_WALLETS` allow-list.**

### Why not a separate repo

A separate admin app would mean:

- Duplicating the existing Anchor SDK wiring (`@tombola/sdk`, `RaffleClient`, RPC config, decoders) — that's the most fragile glue we have.
- Duplicating Redis access (`@/lib/kv/redis`) + every `*-store.ts` helper or building a parallel "admin API" layer that re-reads them.
- Duplicating the wallet-signature auth scaffolding (`profile-auth.ts`, `signed-action.ts`, nonce store).
- Two deploy targets, two preview-URL flows, two sets of env vars.

For a single-founder operator console, the ROI on a second repo is negative until the admin app grows past ~30 routes or admin engineers join.

### Why not a sub-package (monorepo split)

Same reason a standalone repo is overkill, plus monorepo tooling would force a tsconfig/ESLint reshuffle that doesn't pay back at this size.

### Why `/admin/*` inside the existing app works

The frontend already has every primitive the dashboard needs:

| Primitive | Reused from |
| --- | --- |
| On-chain reads | `src/lib/get-pools.ts`, `src/lib/get-pool-detail.ts`, `src/lib/wallet-stats.ts`, `src/lib/wallet-activity.ts`, `src/lib/buyer-pools.ts`, `src/lib/solana/program-queries.ts` |
| Anchor SDK + decoders | `@tombola/sdk` (`generated.getPublicPoolDecoder`, `getPrivatePoolDecoder`, `getTicketBatchDecoder`) |
| Off-chain stores | `src/lib/profile-store.ts`, `src/lib/friend-store.ts`, `src/lib/pool-invite-store.ts` |
| Wallet auth | `src/lib/profile-auth.ts`, `src/lib/signed-action.ts` (ed25519 + nonce + replay protection — already production-grade) |
| UI tokens + components | `src/lib/colors.ts`, `src/components/ui/{Button,StatusPill,CloseButton,Stat}.tsx`, `docs/design/tokens.md` |
| API conventions | `src/app/api/*` (App Router, `NextResponse.json`, `server-only` imports, signed-action verification) |

The dashboard is **purely read-only** (the only "write" is `recompute-cache` style refreshes). Mixing read-only admin routes into the same Next.js app costs nothing — Next isolates them via folder structure and the access-control layer.

### Recommended file layout

```
src/
  app/
    admin/
      layout.tsx                         # admin shell + access gate
      page.tsx                           # executive overview (mockup #1)
      users/
        page.tsx                         # search + table (mockup #2)
        [wallet]/
          page.tsx                       # per-user drill-down
      pools/
        page.tsx                         # public + private pool roster (mockup #3)
        [poolAddress]/
          page.tsx                       # per-pool drill-down
      treasury/
        page.tsx                         # protocol wallet read-only
    api/
      admin/
        _auth.ts                         # shared admin-guard middleware helper
        overview/route.ts                # KPIs aggregate
        users/route.ts                   # paginated user list
        users/[wallet]/route.ts          # per-user detail
        pools/route.ts                   # paginated pool roster
        pools/[address]/route.ts         # per-pool detail
        treasury/route.ts                # protocol wallet snapshot
        risk-signals/route.ts            # heuristic flags
  lib/
    admin/
      access.ts                          # allow-list check
      metrics/
        users.ts                         # cross-wallet aggregations
        pools.ts                         # cross-pool aggregations
        treasury.ts                      # ProtocolConfig + balance reads
        risk.ts                          # heuristic detectors
      time-series.ts                     # daily/weekly bucketing
```

Nothing inside `/admin/*` should be reachable from public navigation. The `Header` component never links to it. Direct URL navigation is the only entry point.

---

## 2. Data model / API audit

### 2.1 Source-of-truth split

Tombola splits state across **on-chain** (Anchor program) and **off-chain Redis** (Upstash). The dashboard reads from both. Nothing in the dashboard *writes* to either — admin is observation-only.

### 2.2 What exists today

**On-chain (read via `RaffleClient` / `program-queries.ts`):**

| Account | Fields relevant to admin | Location |
| --- | --- | --- |
| `ProtocolConfig` | `treasury` pubkey, `protocol_fee_bps`, `max_creator_fee_bps`, `vrf_oracle` | singleton PDA `[b"config"]` |
| `PublicPool` | `pool_type`, `round_number`, `state`, `close_time`, `total_tickets`, `total_pot`, `ticket_price`, `winner`, `winning_ticket`, `vrf_paid` | one PDA per (type, round) |
| `PrivatePool` | `creator`, `state`, `close_time`, `total_tickets`, `total_pot`, `ticket_price`, `creator_fee_bps`, `winner`, `winning_ticket`, `vrf_paid` | one PDA per pool |
| `TicketBatch` | `pool`, `owner`, `first_ticket_id`, `last_ticket_id` | many per pool |
| `Whitelisted` | `pool`, `wallet` (for private-pool invite redemption) | one per redeemed code |

**Off-chain (Redis prefixes, see `src/lib/*-store.ts`):**

| Prefix | Shape | Holds |
| --- | --- | --- |
| `profile:<wallet>` | `ProfileRow` JSON | pseudo, X handle, isPublic, avatar, createdAt, updatedAt |
| `pseudo:<lowercased>` | wallet string | reverse index for pseudo → wallet |
| `pseudo-zset` | sorted-set (lex) | prefix search on pseudos |
| `nonce:<wallet>` | hex string (TTL 300s) | signature nonces |
| `edge:<lo>:<hi>` | `EdgeRow` | friend-graph edge state |
| `friend-accepted:<wallet>` | Set<wallet> | accepted friends |
| `friend-pending-out:<wallet>` | Set<wallet> | sent requests |
| `friend-pending-in:<wallet>` | Set<wallet> | received requests |
| `pool-invite:<pool>:<friend>` | `InviteRow` | private-pool invite (status: sent / redeemed) |
| `pool-invites-by-wallet:<wallet>` | Set<pool> | per-recipient index |
| `pool-invites-by-pool:<pool>` | Set<friend> | per-pool index |

**No SQL database, no Postgres, no separate analytics warehouse.** Upstash Redis is the only off-chain store. This is intentional and stays that way for v1.

### 2.3 Metrics already derivable with zero schema changes

| Requested metric | Derivation |
| --- | --- |
| Total users | `SCAN profile:*` count |
| User profile status public/private | `profile:<wallet>.isPublic` |
| Friends count per user | `SCARD friend-accepted:<wallet>` |
| Total pools created | `getProgramAccounts(dataSize=PublicPool)` + `(dataSize=PrivatePool)` |
| Active / completed / cancelled pools | filter on `pool.state` |
| Public vs private pool participation | count by account discriminant |
| Tickets sold per pool | `pool.total_tickets` |
| Total pot per pool | `pool.total_pot` |
| Participants per pool | distinct `batch.owner` from TicketBatches |
| Per-user spend / tickets / wins | `wallet-stats.ts` already computes this |
| Total platform volume | sum `pool.total_pot` across pools |
| Protocol fees collected | sum `pool.total_pot * 50 / 10_000` over `state == Resolved` pools |
| Treasury balance | `connection.getBalance(ProtocolConfig.treasury)` |
| Pool fill rate / size | derived from `total_tickets * ticket_price` |
| Friend invites sent (private pool) | `SCARD pool-invites-by-pool:<pool>` |
| Friend invites redeemed | count InviteRow with `status == redeemed` |
| Top users by activity | iterate batches, group by owner, sort |
| New users over time | requires `profile.createdAt` — **already stored** |

### 2.4 Missing data — what needs to be added

The off-chain stores were designed for the user-facing app, not analytics. Several metrics require either schema bumps or compute-on-read aggregations:

| Missing | Why we need it | Recommended path |
| --- | --- | --- |
| **`profile.lastSeenAt`** | DAU / WAU / MAU, retention | Bump `ProfileRow`. Cheap write on `/api/profile/me` GET. |
| **Daily new-user counter** | New-users-over-time without SCAN | Redis ZSET `profile-created:<YYYY-MM-DD>` with wallet members. Write once at profile creation. |
| **Daily volume counter** | Revenue-by-day chart | Derive from on-chain — but at scale, materialize a snapshot. v1: compute on read (cached); v2: keeper writes a daily roll-up. |
| **Pool creation event log** | "Pools created over time" with timestamps | On-chain doesn't store a created-at; `getSignaturesForAddress(poolAddress)` returns it but is slow. Path: cache (pool, createdSlot, createdBlockTime) on first observation. |
| **First-ticket-purchase wallet→pool funnel** | Signup → first ticket conversion | Compute from `min(batch.firstTicketId)` per wallet vs `profile.createdAt`. No schema change. |
| **Risk flags** | Duplicate-wallet detection, rapid-fire buy alerts | Materialized later. v1: compute live with caching. |

The recommendation is to start with the metrics that work today (≈80% of the list) and **defer the schema bumps to phase 2** so we can ship something usable in days, not weeks.

### 2.5 API conventions to reuse

All `/api/admin/*` routes should follow the existing patterns:

- `"use server-only"` import at the top of each route.
- Body: `NextResponse.json({...})` — never serialize bigints (convert to string).
- Auth check: shared `requireAdmin(req)` from `lib/admin/access.ts` returns `null` on success or a `NextResponse` 403 on failure.
- In-memory cache with TTL for expensive aggregations (we already use this pattern in `/api/recent-activity`).
- No DB transactions — every admin route is read-only.

---

## 3. Access control

### 3.1 Current state of auth in the frontend

The app has **two existing auth modes**:

1. **Wallet-signature auth** — `profile-auth.ts` + `signed-action.ts`. Used for `/api/profile/me` edits, friend actions, pool-invite mutations. Pattern: issue nonce → wallet signs `tombola:<action>:<args>:<nonce>` → server verifies ed25519, consumes nonce.
2. **Bearer token (keeper)** — `/api/keeper/tick` accepts `Authorization: Bearer <CRON_SECRET>`. Used by Vercel Cron only.

**There is no role / RBAC primitive today.** No `isAdmin`, no `users.role` column, nothing.

### 3.2 Recommended admin auth model

Two layers, defense-in-depth:

**Layer 1 — wallet allow-list (`ADMIN_WALLETS` env var)**

```
# .env (server-only, never NEXT_PUBLIC_)
ADMIN_WALLETS=A9XZ...CDWY,EaAL...pLBt
```

Comma-separated list of base58 wallet pubkeys. Read at request time, not at module init, so rotation doesn't require redeploy of every Lambda.

Why env var, not Redis:

- Bootstrap problem: even Redis writes need an admin to perform them. Env var sidesteps the chicken-and-egg.
- Bytes-of-code minimal: no admin-management UI required for v1.
- Auditable in deploy history (Vercel env-var changelog).
- Survives Redis incidents.

Future scale-up: when admin headcount > 5, migrate to a `admin:<wallet>` Redis key with metadata (added-by, added-at, role) and provide a CLI script (not a UI) to rotate it. Out of scope for v1.

**Layer 2 — wallet-signature on every privileged read**

The admin user must sign a short-lived nonce to prove they hold the private key (not just know the public key). Same pattern as `/api/profile/me`:

1. Browser GETs `/api/admin/nonce/<wallet>` → server issues nonce.
2. Wallet signs `tombola:admin-session:<nonce>`.
3. Browser POSTs `/api/admin/session` with `{ wallet, nonce, signature }`.
4. Server verifies, sets an **httpOnly secure session cookie** with a server-side TTL (15 min, sliding).
5. Subsequent `/api/admin/*` requests check the cookie; expired cookies force re-sign.

The cookie payload is signed (HMAC-SHA256 with a server secret) so the browser can't forge it. The signed payload contains only `{ wallet, expiresAt }`.

```ts
// src/lib/admin/access.ts
export async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; wallet: string }
  | { ok: false; response: NextResponse }
>
```

**Layer 3 — route-level gate on every `/admin/*` page**

`src/app/admin/layout.tsx` is a server component that:

- Reads the admin session cookie.
- If missing or expired: renders a `<AdminLogin />` client component (wallet connect + sign-to-enter flow).
- If valid but wallet not in allow-list: renders a 403 "this wallet is not authorized" screen.
- Otherwise: renders children.

This means the admin URL is never publicly reachable in any meaningful sense — even seeing the page chrome requires a signed session.

### 3.3 PII / sensitive-data isolation

The admin dashboard surfaces:

- Raw wallet addresses for every row (✓ already public — they're on-chain).
- Pseudos + X handles regardless of `isPublic` flag (admin overrides the privacy toggle — necessary for moderation).
- Friend graph edges.
- Per-user financials (spent / won / net P&L).
- **Never** the keeper keypair, never any private keys, never raw nonces.

The non-admin app **must not** start leaking private profile fields. The `/api/users/search`, `/api/profile/[handle]`, `/api/friends/*` routes continue to respect `isPublic`. Only the `/api/admin/*` routes bypass it, and only because the layer-1 + layer-2 gate is in place.

Tests for this: every admin route gets a test that calls it without the session cookie and asserts 403.

### 3.4 Observability

Every admin-route call should log:

- Hit timestamp
- Calling wallet
- Route + (sanitized) query
- Result size

Sink: stdout for now (Vercel log drain captures it). Future: a structured `admin:audit:<date>` ZSET in Redis if it ever needs to be queryable in-app.

---

## 4. Metric inventory

Every requested metric, mapped to its data source and complexity tier:

### 4.1 Legend

- **T0** = derivable from current data with one or two RPC / Redis calls. Ships in phase 1.
- **T1** = derivable but expensive — requires fan-out aggregation. Cache 30-60s. Phase 1 or 2.
- **T2** = needs a schema bump or a materialization job. Phase 2 or 3.
- **T3** = heuristic / risk signal. Phase 3.

### 4.2 User metrics

| Metric | Tier | Source |
| --- | --- | --- |
| Total users | T0 | `SCAN profile:*` + count |
| New users by day/week/month | T0 | `profile.createdAt` bucketed |
| DAU / WAU / MAU | **T2** | needs `profile.lastSeenAt` (new field) |
| User retention curves | **T2** | needs `lastSeenAt` history snapshots |
| Profile public/private split | T0 | aggregate `isPublic` over all profiles |
| Friends count per user | T0 | `SCARD friend-accepted:<wallet>` |
| Top users by activity | T1 | iterate all TicketBatches, group by owner, sort by recency / count |
| Users in most pools | T1 | same scan, group by distinct pools |
| Users with highest ticket spend | T1 | same scan, sum `quantity * pool.ticket_price` |
| Suspicious / high-activity users | T3 | risk heuristics (4.7) |

### 4.3 Wallet / financial metrics

| Metric | Tier | Source |
| --- | --- | --- |
| User wallet addresses | T0 | profile keyset |
| Connected wallet status | n/a — only known when user is live in the app (we can't tell from outside) |
| Total platform volume (lifetime) | T1 | sum `pool.total_pot` across all pools |
| Total ticket purchase volume | T1 | identical to above (every lamport in `total_pot` is a ticket purchase) |
| Avg ticket spend per user | T1 | total volume / total users with batches |
| Avg bet per ticket | T0 | weighted avg `pool.ticket_price` |
| Avg bet per pool | T1 | mean `pool.total_pot` over resolved pools |
| Avg user spend across all pools | T1 | per-user aggregation |
| Total prizes paid out | T1 | sum `winner_share` over resolved pools (= `total_pot * 9950/10000 - creator_fee`) |
| Pending payouts | T1 | sum `total_pot` for `state == AwaitingVrf` |
| Protocol fees collected | T1 | sum `total_pot * 50/10000 - vrf_paid` over resolved pools |
| Revenue by day/week/month | **T2** | needs settle-time timestamp; on-chain doesn't store it directly. Use `getSignaturesForAddress(pool, settle_sig)` and cache. |
| Wallet activity per user | T1 | reuse `wallet-activity.ts` |
| Transaction history & status | T1 | `getSignaturesForAddress(wallet)` filtered to program |

### 4.4 Pool / raffle metrics

| Metric | Tier | Source |
| --- | --- | --- |
| Total pools created | T0 | gPA count |
| Active / Completed / Cancelled | T0 | partition by `state` |
| Public vs private participation | T0 | by account type |
| Participants per pool | T1 | distinct `batch.owner` per pool |
| Tickets sold per pool | T0 | `pool.total_tickets` |
| Avg tickets per participant | T1 | per pool: `total_tickets / distinct_owners` |
| Avg pool size / pot | T1 | mean `total_pot` |
| Pool conversion rate | T2 | needs definition — viewed vs joined? Not measurable from chain alone. **Defer.** |
| Pool fill rate | n/a — Tombola pools have no max-size cap, so "fill rate" doesn't apply. Substitute: tickets sold relative to pool age. |
| Time to fill | T2 | needs settle vs create timestamps |
| Most popular pool types | T1 | tickets sold grouped by `pool_type` |
| Low-participation pools | T0 | filter by `total_tickets < threshold` and `state == Open` |
| Unusually high activity | T3 | heuristic (4.7) |

### 4.5 Frequency & behavior

| Metric | Tier | Source |
| --- | --- | --- |
| Public vs private participation per user | T1 | partition batches |
| Weekly / Biweekly / Triweekly / Monthly usage | T1 | partition pools by `pool_type` |
| Participation frequency per user | T1 | batch count per wallet |
| Repeat participation rate | T1 | wallets with ≥2 distinct pools / total wallets |
| Avg pools joined per user | T1 | mean distinct-pool count |
| Avg tickets bought per pool (per user) | T1 | mean `qty` per `(wallet, pool)` |
| Friend-invite conversion (private) | T0 | `redeemed / sent` from `pool-invite-store` |
| Invite-link conversion | **T2** | Tombola's private pool uses redemption codes — `Whitelisted` PDA exists post-redeem, but the issuance count isn't on-chain. Redis tracks per-friend invites; bare invite-links don't have a server-side touchpoint. Needs a "claim attempted" tracker. |

### 4.6 Invite metrics

| Metric | Tier | Source |
| --- | --- | --- |
| Private pools created | T0 | gPA PrivatePool count |
| Friends invited directly | T0 | `SCARD pool-invites-by-pool:<pool>` |
| Invite-link joins | T2 | (see above) |
| Friend-invite conversion rate | T0 | redeemed / sent ratio per pool |
| Top users creating private pools | T1 | group `PrivatePool.creator` |
| Private pool participation trends | T1 | bucket by creation time |

### 4.7 Risk & fraud signals (T3)

These are heuristic — surface as **flags**, not absolutes. Admin reviews them.

| Flag | Heuristic |
| --- | --- |
| Duplicate-wallet suspicion | Same IP signing across multiple wallets (would need IP log — defer to phase 3) |
| Rapid-fire ticket buys | One wallet > N tickets in M seconds across pools |
| Self-dealing private pool | Pool creator buys >50% of tickets and wins |
| Concentrated stake | Single buyer owns >80% of tickets in a public pool |
| Big winner alert | Winner takes ≥X SOL prize (define X by std-dev over recent draws) |
| Stuck pool | `AwaitingVrf` for > 1 hour |
| Failed VRF retries | `commit_draw_*` invoked > 3 times for same pool |
| Profile churn | Pseudo changed > 5 times in 30 days |

### 4.8 Operator-focused metrics

| Metric | Tier | Source |
| --- | --- | --- |
| Revenue trends | T1+T2 | sum-of-fees over time-buckets |
| User lifetime value (LTV) | T1 | per-user net spend (excluding wins) |
| Avg revenue per user (ARPU) | T1 | total fees / total participating wallets |
| Churn indicators | T2 | needs `lastSeenAt` |
| Large-transaction alerts | T1 | filter buys by single-tx total cost |
| Failed transactions | T1 | parse `getSignaturesForAddress(programId)` for `err != null` (sample-based; full scan is too slow) |
| Payout issues | T1 | pools in `AwaitingVrf` past their close_time + safety window |
| Pools requiring manual review | T1+T3 | union of risk flags |
| Signup → first-ticket funnel | T1 | join `profile.createdAt` with `min(batch.firstTicketId.blockTime)` |

---

## 5. Protocol wallet

This section is the founder-facing answer to all eight wallet questions. **Underlying research:** see the agent's report (file refs throughout); summary here.

### 5.1 Where the address lives

**On-chain, in the `ProtocolConfig` singleton PDA**, derived from seed `[b"config"]`. The PDA's `treasury: Pubkey` field is the protocol/platform wallet (`programs/raffle/src/state.rs:9-24`).

- It is **not** in env vars at runtime. The deployer reads `RAFFLE_TREASURY` *only at init time* (`scripts/deploy.ts:49`) and writes it to the PDA. From then on, every reader fetches it from-chain via `RaffleClient.getProtocolConfig()`.
- It is **not** in Redis or any database.
- The frontend already reads it correctly: `src/lib/keeper/settle.ts:266-267`.
- The PDA is **write-once** — there is no `update_treasury` instruction. Changing it requires redeploying the program with a new init.

### 5.2 How fees are collected

Constant rate: **0.5% of pot, at settle time, transferred directly to the configured treasury pubkey.**

- Constant: `PROTOCOL_FEE_BPS = 50` (`programs/raffle/src/constants.rs:18-19`). Hardcoded.
- Computed at settle: `protocol_fee = total_pot * 50 / 10_000` minus VRF cost reimbursement (~10 lamports per draw).
- Sites: `programs/raffle/src/instructions/settle_draw_public.rs:106-135`, `settle_draw_private.rs:96-141`.
- Private pools also pay a creator fee (0–5%, capped at `MAX_CREATOR_FEE_BPS = 500`) — separate from protocol fee.

**There is no accumulator account.** Fees flow pool → treasury on every settle. Until a pool settles, the fee portion sits in the pool's lamport balance.

### 5.3 Who controls the protocol wallet

**Whoever owns the `treasury` pubkey signs to move funds.** The Anchor program never authorizes a transfer *from* the treasury — it only authorizes transfers *to* it. The treasury is a regular Solana account from the program's perspective.

**Current devnet posture:** the treasury is the deployer's own keypair (`EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt`, per `SESSION_HANDOFF.md:130, 151-154`). This is the *only* time the protocol is "custodial in a single key" and it ends at mainnet rotation.

**Mainnet posture (per `DESIGN_DECISIONS.md:70-78` D-009 and `PROTOCOL_SPEC.md:16`):** treasury must be rotated to a **Squads 2-of-3 multisig** before mainnet launch. This is in the pre-mainnet checklist (`SESSION_HANDOFF.md:109-118`).

### 5.4 Custodial / multisig / smart-contract treasury?

**Multisig (Squads).** Specifically: a Squads 2-of-3 vault PDA. Not custodial in the centralized-exchange sense. Not a "smart-contract treasury" in the program-controlled sense — the raffle program has no authority to move funds out.

### 5.5 Safest cash-out flow

**Off-chain via Squads. Do not add a withdrawal instruction to the Anchor program.**

The reason a withdraw instruction is unsafe: the program is currently provably non-custodial (any audit confirms zero authority over pool/treasury funds). Adding a privileged withdraw ix breaks that invariant and demolishes the trust model documented in `THREAT_MODEL.md:17-18, 33`. Audit findings would surface this immediately.

**The correct flow:**

1. Founder + co-signer go to the Squads web app.
2. Open a "Send SOL" proposal from the treasury vault to the destination wallet (e.g. an exchange wallet, a payroll wallet, an employee).
3. Both signers approve.
4. Squads executes; funds land in the destination.

The admin dashboard's role: **read-only**. Show treasury balance, recent inflows, balance-over-time chart, and a deep-link button that opens the Squads UI to the vault. Never sign anything.

### 5.6 Cashing out to pay employees

**Recommended process:**

1. Founder creates a "payroll" wallet (separate Squads vault or a hot wallet that gets topped up periodically) — *not* the protocol treasury directly.
2. Periodic transfer from treasury → payroll vault via Squads (steps in 5.5).
3. Payroll vault makes the individual employee payments via standard Solana transfers / Foundation, etc.

This separation matters because:

- The treasury holds all platform revenue. Mixing employee payouts directly from it makes audit / accounting harder.
- A second hop limits blast radius if a key is compromised.
- The treasury's transaction history stays a clean "fees in, periodic outflow to payroll" pattern.

### 5.7 Existing transfer tooling

**None exists, intentionally.**

- `scripts/` has `deploy.ts`, `init_public_pools.ts`, `codegen.ts` — no transfer script.
- `migrations/` is an empty stub.
- The frontend has no signer with treasury authority and never will.

### 5.8 What we should and should not build

✅ **Build (read-only):**

- Treasury balance display (live SOL).
- Treasury balance over time (sampled, cached).
- Settle-event log (pool → treasury inflow per draw).
- Squads deep-link button.
- "Authority rotation status" indicator: flag if `treasury` pubkey is not yet a Squads multisig PDA (currently true on devnet; should auto-pass once mainnet rotation happens).

❌ **Do not build:**

- Any withdraw / claim instruction in the Anchor program.
- Any backend service that holds the treasury private key.
- Any "transfer from dashboard" button.
- Any signed-action endpoint that moves treasury funds.

❌ **Do not store:**

- Treasury private key — anywhere.
- Squads signer keys — anywhere.
- A mirror of the treasury address in env or Redis (read from-chain).

### 5.9 If the treasury were not a multisig

If post-launch the multisig falls back to a single hot key (it should not), the safest mitigation is:

- Hold only the working balance in the hot key; sweep the bulk to a cold wallet (separate keypair, stored on a hardware wallet).
- Even the sweep is manual — performed via standard wallet tools, not the dashboard.

The dashboard would surface a warning banner when treasury is a single-sig key.

---

## 6. Phased implementation plan

Each phase ships a working slice; nothing waits on the next.

### Phase 1 — Foundation (1–2 days)

- `src/lib/admin/access.ts` + admin session cookie machinery.
- `src/app/admin/layout.tsx` server-component gate.
- `src/app/admin/page.tsx` executive overview shell (mockup #1) with stub data.
- `src/app/api/admin/overview/route.ts` returning the easy T0 + T1 metrics.
- Test coverage for the access gate (unauthorized → 403; allow-listed but no signature → 401; valid signature → 200).
- `ADMIN_WALLETS` env var documented in `README` + `.env.example`.

Ships: a real, gated, working overview page with maybe half the requested KPIs filled in.

### Phase 2 — Users + Pools (2–3 days)

- `src/app/admin/users/page.tsx` — paginated table with search, sort, filters (mockup #2).
- `src/app/admin/users/[wallet]/page.tsx` — per-user drill-down (reuses `wallet-stats.ts`).
- `src/app/admin/pools/page.tsx` — paginated pool roster with filter chips for state + type (mockup #3).
- `src/app/admin/pools/[address]/page.tsx` — per-pool drill-down (reuses `get-pool-detail.ts`).
- API routes for each with proper cache TTLs.
- Charts: SVG-only (no external chart dep) for KPIs; recharts only if a chart proves too hairy in raw SVG.

### Phase 3 — Treasury + Risk (1–2 days)

- `src/app/admin/treasury/page.tsx` — read-only protocol-wallet view.
- `src/lib/admin/metrics/treasury.ts` — ProtocolConfig read + balance + recent inflows.
- `src/lib/admin/metrics/risk.ts` — heuristic flags from §4.7.
- "Authority rotation status" indicator.
- Squads deep-link.

### Phase 4 — Schema bumps for time-series (optional, 1 day)

- Add `profile.lastSeenAt` (write at every authenticated profile read).
- Add `profile-created:<YYYY-MM-DD>` daily ZSET.
- Add daily volume roll-up writer in the keeper tick (cheap incremental write).
- Backfill historical daily ZSETs from existing `profile.createdAt`.

### Phase 5 — Audit log + alerting (later)

- Structured admin-action audit log.
- Risk-flag thresholds become configurable.
- Email / webhook alert for stuck pools or large draws.

---

## 7. What I need from the founder

Before I write any code, please review:

1. **Architecture call** — does "inside the existing frontend, `/admin/*` route" feel right, or do you want a separate repo? (Recommendation: stay together.)
2. **Access model** — env-var allow-list + wallet-signature session cookie? Or something stronger like a separate Squads-gated admin signer?
3. **Mockups** — open the three HTML files in `docs/design/mockups/admin-*.html` and tell me which layout direction to take. They're intentionally different so you can pick & mix.
4. **Phase order** — phase 1 → 2 → 3 → 4 makes sense, but if treasury read-only is the most urgent, we can flip phase 2 and 3.
5. **Schema bumps** — am I clear to bump `ProfileRow` with `lastSeenAt` in phase 4? It's the cleanest way to unlock DAU/WAU/retention.

Once you've reviewed, ping me with approve / change-requests and I'll start phase 1.

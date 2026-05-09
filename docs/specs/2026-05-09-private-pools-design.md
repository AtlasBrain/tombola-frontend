# Private Pools — Frontend Design

**Date:** 2026-05-09
**Author:** AtlasBrain
**Status:** Approved (user thumbs-up 2026-05-09 on Sections 1–7 inline brainstorm)
**Repo:** [tombola-frontend](https://github.com/AtlasBrain/tombola-frontend)
**Branch:** `feat/private-pools`
**Companion repo:** [Project-Tombola](https://github.com/AtlasBrain/Project-Tombola) — on-chain protocol + SDK (already shipped)

---

## Goal

Ship the user-facing surface for private pools — the on-chain protocol's whole second half — so that any wallet can, end-to-end on devnet:

1. **Create** a private pool with custom params and auto-generated invite codes.
2. **Distribute** self-contained redemption links via any channel (email, Slack, DM, paper).
3. **Redeem** by clicking a link, which lands the buyer on a redemption page that consumes the URL params and submits the redeem instruction.
4. **Buy** tickets (Whitelist mode) or auto-purchase one ticket (OneCodePerTicket mode).
5. **Draw** — anyone can trigger commit + settle from the pool detail page after `close_time`.

The on-chain protocol + SDK side is already complete (see [`programs/raffle/src/instructions/`](https://github.com/AtlasBrain/Project-Tombola/tree/main/programs/raffle/src/instructions): `create_private_pool`, `redeem_invite_code`, `buy_ticket_private`, `commit_draw_private`, `settle_draw_private`, `close_empty_private_pool`). This spec is **frontend-only**.

## Non-goals

- Off-chain code storage. The Merkle root lives on-chain; the rest never leaves the browser. No backend, no Pastebin, no GitHub gist.
- Public discovery / browse of private pools. They are invite-only by design (PROTOCOL_SPEC.md line 48).
- Email or SMS sending. The creator distributes redemption links via whatever channel they prefer.
- Token-gated pools, mobile-native app, mainnet (devnet only).
- QR code generation. Nice-to-have follow-up (one library import); not required for v1.

## Architecture

Pure frontend addition, mirroring the existing public-pool surface where patterns transfer:

- **Routes (Next.js app router)**: 4 new routes, all under the existing live page at `https://tombola-frontend-gamma.vercel.app/`.
- **Components**: 10 new `.tsx` files. All consumer of the vendored SDK at [`vendor/sdk/`](../../vendor/sdk/SNAPSHOT.md). Reuses the wallet adapter, `Countdown`, `FlashOnChange`, `LivePoolWatcher`, toast layer, and Tailwind v4 design system already on `main`.
- **Library helpers**: 1 new file (`src/lib/private-pools.ts`) for redemption-link encoding/decoding and the `getProgramAccounts`-based "my pools" query.
- **No on-chain or SDK changes.** Everything works against the SDK's existing `RaffleClient.createPrivatePool` / `redeemInviteCode*` / `buyTicketPrivate` / `commitDrawPrivate` / `settleDrawPrivate` / `closeEmptyPrivatePool` methods.

### Routing

| Route | Purpose | Auth |
|---|---|---|
| `/create` | Pool creation form + post-success links display | Wallet connect required |
| `/create/my-pools` | Lists pools the connected wallet has created | Wallet connect required |
| `/redeem` | URL-param consumer; runs redemption ix | Wallet connect required at redeem-time |
| `/pool/private/[pubkey]` | Private pool detail (live state, buy, draw, winner) | None to view; wallet to act |

The `/pool/private/[pubkey]` route extends the existing `/pool/[type]/[round]` namespace so the URL mental model stays consistent with public pools.

## Redemption link format

```
https://tombola-frontend-gamma.vercel.app/redeem
  ?p=<base58_pool_pubkey>
  &c=<hex_code>             16 bytes default → 32 hex chars
  &pr=<base64_proof>        proof = concatenated 32-byte siblings → base64
  &m=W|O                    access mode shorthand (W=Whitelist, O=OneCodePerTicket)
```

**Length budget**:
- Base path + base64 padding: ~50 chars
- `p` (pool pubkey base58): 44 chars
- `c` (16-byte hex code): 32 chars
- `pr` (base64 proof, 100-leaf tree → 7 siblings × 32 bytes → 224 raw → ~300 base64 chars): ~300 chars
- `m`: 1 char
- Total: ~430 chars — comfortable for SMS, email, QR codes (QR up to ~2900 chars)

**5000-leaf cap is enforced at the form layer only** — the on-chain `create_private_pool` accepts any tree size (it only stores the 32-byte root). Beyond 5000, proof depth grows to 13 siblings → ~570-char proof → ~720-char URL. Still works on every distribution channel; just visually long. The form rejects N > 5000 with a clear message; this can be relaxed by editing one constant when needed.

**Self-contained, no off-chain storage**: the link IS the credential. Whoever has it can redeem (single-use enforced by the on-chain `RedeemedCode` PDA at `[b"redeem", pool, code_hash]`). This matches the spec's threat model — codes are bearer tokens.

## Components

### New components (frontend-only, all in `src/`)

| File | Responsibility |
|---|---|
| `app/create/page.tsx` | Page: render `<CreatePoolForm>` and the post-success `<RedemptionLinkList>` |
| `app/create/my-pools/page.tsx` | Page: render `<MyPoolsView>` with the connected wallet's created pools |
| `app/redeem/page.tsx` | Page: parse URL params, render `<RedemptionInfo>` + `<RedeemButton>` |
| `app/pool/private/[pubkey]/page.tsx` | Page: private pool detail (state, buy, draw, winner) |
| `components/CreatePoolForm.tsx` | Form: ticket price, duration, fee, code count, access mode, submit |
| `components/RedemptionLinkList.tsx` | Table of generated codes + per-row copy buttons + CSV download |
| `components/PrivatePoolCard.tsx` | Like `PoolCard` + creator info + access mode badge |
| `components/RedeemButton.tsx` | Single click → wallet sign → submit redeem ix (mode-aware) |
| `components/BuyTicketPrivateButton.tsx` | Post-redemption purchase (Whitelist mode only) |
| `components/DrawWinnerButton.tsx` | Post-close commit + settle flow; permissionless |
| `components/MyPoolsView.tsx` | List rendering for the creator's `/create/my-pools` page (status, link to detail) |
| `lib/private-pools.ts` | `encodeRedemptionLink()`, `decodeRedemptionLink()`, `findMyPrivatePools(wallet)` |

### Reuses (verbatim from `main`)

- Wallet adapter (Phantom / Solflare / Backpack via Wallet Standard) at `components/WalletProviders.tsx`
- `components/Countdown.tsx` — countdown display
- `components/FlashOnChange.tsx` — amber pulse on data change
- `components/LivePoolWatcher.tsx` — WebSocket subscription pattern (private pools fits the same mold)
- `components/Toast.tsx` — tx event toasts
- `lib/format.ts`, `lib/explorer-url.ts`, `lib/kit-to-web3.ts`
- The vendored SDK at `vendor/sdk/` — already exports everything we need

## Creator flow

1. Connect wallet on `/create`
2. Form fields:
   - Ticket price (input in SOL, converted to lamports for on-chain call)
   - Duration (split into days + hours dropdowns; converted to seconds for on-chain `duration` arg; hard-bounded to [1h, 90d] per `MIN_PRIVATE_DURATION_SECS` / `MAX_PRIVATE_DURATION_SECS`)
   - Creator fee (slider, 0–5% in 0.5% increments → bps for on-chain)
   - Number of codes (input, 1–5000)
   - Access mode (radio: "Whitelist" / "One ticket per code")
3. Validate inputs client-side; render preview ("You'll get N codes; pool closes at <ISO timestamp>; max payout is M SOL minus 0.5% protocol + X% creator").
4. Submit → frontend:
   1. Generate `N` codes via `sdk.generateInviteCode()`
   2. Build Merkle tree via `sdk.buildCodeTree(codes)` → `{ root, proofs }`
   3. Derive `poolId` by counting the wallet's existing private pools via `getProgramAccounts(filter: creator==wallet)`
   4. Call `client.createPrivatePool({ creator: wallet, poolId, ticketPrice, duration, creatorFeeBps, accessMode, merkleRoot: root })`
   5. Sign + submit; await confirmation
5. After confirmation, render `<RedemptionLinkList>`:
   - One row per code with the full encoded URL + per-row copy button
   - "Copy all links" button (newline-joined)
   - "Download links.csv" button (columns: index, code, redemption_url)
   - Banner: "These links won't be shown again. Save them now."
6. Optional: link to `/create/my-pools` to verify the pool landed.

`poolId` derivation note: the `PrivatePool` account's discriminator is the first 8 bytes; `creator` is the next 32 bytes. So `getProgramAccounts(programId, filter: dataSize=PrivatePool::INIT_SPACE+8, memcmp{offset=8, bytes=wallet.publicKey})` returns the wallet's pools. Take `count` as the next id; race-safe because Solana txs are sequential per signer (the next pool init either succeeds with `pool_id=count` or fails with PDA-already-exists, in which case we retry with `count+1`).

## Redeemer flow

### Whitelist mode (`m=W`)

1. Buyer clicks redemption link → arrives at `/redeem?p=...&c=...&pr=...&m=W`
2. Frontend decodes params, fetches pool state, renders:
   - Pool's pot, ticket count, countdown
   - "You're invited" callout
   - Connect Wallet button (or Redeem button if already connected)
3. Click Redeem → wallet signs → frontend submits `client.redeemInviteCodeWhitelist({ pool, code, proof, buyer: wallet })`
4. After confirmation, redirect to `/pool/private/[pool]` with toast: "You're whitelisted. Buy tickets below."
5. On the pool detail page, `<BuyTicketPrivateButton>` is enabled for this wallet (Whitelisted PDA exists). Buyer can buy any number of tickets at any time before close_time.

### OneCodePerTicket mode (`m=O`)

1. Same redemption link landing as above.
2. Click Redeem → wallet signs → frontend submits `client.redeemInviteCodeOneTicket({ pool, code, proof, buyer: wallet })`
3. This single instruction atomically:
   - Verifies the Merkle proof
   - Marks the code redeemed
   - Mints exactly one TicketBatch for the buyer (charges them `ticket_price` lamports)
4. After confirmation, redirect to `/pool/private/[pool]` with toast: "1 ticket purchased."
5. No separate buy button on the pool detail page for this wallet — the redemption was the purchase.

### Error states (both modes)

- Invalid URL params → "Invalid redemption link" + suggest contacting the creator
- Pool not found / already drawn → "This pool is no longer accepting entries"
- Pool past close_time → "Entries closed N ago"
- Code already redeemed → "This code has already been used"
- Wallet not connected → wallet connect prompt
- Insufficient SOL → "You need ~0.005 SOL of devnet SOL to redeem; visit https://faucet.solana.com"
- Tx simulation failure → toast with explorer link to the failed sim

## Pool detail page (`/pool/private/[pubkey]`)

Mirrors `/pool/[type]/[round]` with three differences:

1. **Header shows access mode + creator** ("Whitelist" / "One per code"; creator pubkey with explorer link).
2. **Buy button** is conditionally rendered based on `(accessMode, walletWhitelistedPda exists)`. Connected wallets that aren't whitelisted see "Need an invite code" with no button.
3. **Settlement section** is the frontend-keeper UX (Section 6 below).

`LivePoolWatcher` handles `accountSubscribe` for the pool PDA, so state/tickets/pot update without page refresh.

## Frontend-as-keeper for private pools

Public pools have the GitHub Actions cron daemon. Private pools are NOT in that loop — the daemon iterates only the four public pool types. Private-pool draw is triggered from the pool detail page by anyone visiting:

| Pool state | UI shown | What clicking does |
|---|---|---|
| `Open` + `now < close_time` | Countdown + buy/redeem CTAs | (no draw button) |
| `Open` + `now ≥ close_time` + `total_tickets > 0` | "Draw winner" button | Generates Switchboard randomness keypair → bundle `[Randomness.create]` then `[Switchboard.commitIx + raffle.commit_draw_private]` (atomic) |
| `Open` + `now ≥ close_time` + `total_tickets == 0` | "Reclaim creator rent" button | Calls `closeEmptyPrivatePool({ creator })` (creator-only) |
| `AwaitingVrf` + reveal pending | "Waiting for Switchboard reveal..." spinner; polls every 5s | (auto) |
| `AwaitingVrf` + reveal landed | "Settle now" button (auto-fires once reveal detected) | Bundle `[Switchboard.revealIx + raffle.settle_draw_private]` (atomic, same Clock::slot per [D-068](https://github.com/AtlasBrain/Project-Tombola/blob/main/DESIGN_DECISIONS.md)) |
| `Resolved` | Winner display, payout summary | (display-only) |

**Caller economics:** clicker pays the tx fee, gets reimbursed for `vrf_paid` out of protocol-fee accrual (D-030). Net cost ~0.001 SOL.

**Race resolution:** all on-chain instructions are permissionless and idempotent at the state level — if two visitors click "Draw winner" in the same second, the loser's tx fails on the `state == Open` check and the page just re-renders into the next state. No coordination needed.

**Switchboard reveal timing:** mirrors the daemon's pattern (D-068). Use `skipPreflight: true` on the atomic settle tx because preflight simulates at slot N while the tx lands at slot N+M, and the strict `clock_slot == reveal_slot` check would fail in simulation.

## State + data layer

- **Pool state reads:** existing `LivePoolWatcher` pattern. `accountSubscribe` for live updates, plus `getAccountInfo` for initial render.
- **My pools query:** `getProgramAccounts(programId, filter: dataSize, memcmp{offset=8, bytes=walletPubkey})` — single RPC call, cached in React state with manual refresh on tx confirmation. No SWR/React Query needed for v1.
- **Code → URL encoding:** `lib/private-pools.ts:encodeRedemptionLink({ pool, code, proof, mode })` returns a `URL` object. Round-trip-tested in unit tests. Mode encoded as `W|O`. Proof encoded as concatenated bytes → base64url (URL-safe variant).
- **Whitelisted PDA check:** to decide if the buy button is enabled, derive `[b"whitelisted", pool, wallet]` PDA and `getAccountInfo` it. Cached for 30s per `(pool, wallet)` pair, with explicit cache invalidation immediately after a successful `redeemInviteCodeWhitelist` confirmation so the buyer doesn't see a stale "need an invite code" screen.

## Error handling

| Error | UX |
|---|---|
| Wallet not connected | Connect Wallet button replaces action button |
| Insufficient SOL (< ~0.005) | "Top up devnet SOL" link to faucet |
| Pool fetched but state not Open at action time | Disabled button + state-specific message |
| Tx simulation failed | Toast with `Explorer ↗` link to the failed signature |
| Tx send failed (network) | Toast with retry button |
| Switchboard gateway error during settle | Toast: "Oracle network temporarily unavailable, retry in 30s"; auto-retry once |
| URL params malformed | `/redeem` page shows "Invalid redemption link" with no action button |

All toasts use the existing `Toast.tsx` layer.

## Testing strategy

**Unit (vitest):**
- `lib/private-pools.ts:encodeRedemptionLink` round-trips with `decodeRedemptionLink`
- Merkle proof construction for known-fixture trees (use the existing `vendor/sdk/merkle.ts` test fixtures)
- `findMyPrivatePools` filter shape (mock RPC, assert correct memcmp filter)
- URL parsing rejects malformed params

**Component (testing-library + happy-dom, existing setup):**
- `<CreatePoolForm>` field validation (negative price, out-of-range duration, fee > 5%, count > 5000)
- `<RedemptionLinkList>` renders N rows for N codes; copy + download work
- `<RedeemButton>` dispatches the right redemption ix based on mode
- `<DrawWinnerButton>` renders the right state-aware label

**Manual E2E on devnet:**
- Create a 3-code Whitelist pool, distribute one link, redeem from a different wallet, buy 2 tickets, advance close_time (or wait), trigger draw + settle, verify payout.
- Same for OneCodePerTicket: 5-code pool, redeem 3 codes (buys 3 tickets atomically), draw, verify winner is one of the 3 redeemers.

## Risks + mitigations

- **Bearer-token risk** (link interception): mitigated by single-use enforcement on chain. Redemption links should be treated like one-time passwords. Document this in the creator UI.
- **Long URL on large pools**: 5000-cap keeps URLs ≤ ~720 chars. Document QR-code-as-follow-up if creators hit this.
- **Switchboard timing flakes** (oracle network blip): the page polls and retries; if it persists past 1h after close, on-chain `retry_draw_public` exists for public — for private, the creator/anyone can call `retry_draw_private` (same mechanism). Add a "Retry draw" button after 1h elapsed.
- **Wallet localhost dropped** (Phantom 2026): irrelevant here — devnet only, and Phantom supports devnet natively.
- **Merkle proof depth blow-up**: proof byte-length scales with `log2(N)`. 5000 codes = depth 13. URL stays well under SMS limits.

## Implementation order (suggested)

1. `lib/private-pools.ts` + unit tests — foundation
2. `<CreatePoolForm>` + `/create/page.tsx` — creator can ship pools
3. `<RedemptionLinkList>` + CSV export — creator can distribute
4. `/redeem/page.tsx` + `<RedeemButton>` — buyer can redeem
5. `/pool/private/[pubkey]/page.tsx` — buyer + everyone can view
6. `<BuyTicketPrivateButton>` — Whitelist mode purchase
7. `<DrawWinnerButton>` — keeper UX
8. `<MyPoolsView>` + `/create/my-pools/page.tsx` — creator dashboard
9. Manual devnet E2E

This order delivers a usable end-to-end flow at step 7; steps 8–9 are polish + verification.

## Out of scope (revisit as follow-ups)

- QR code generation for redemption links (drop-in `qrcode` library; ~30 LoC).
- Creator analytics (views/redeemed/tickets per code).
- Pool deletion before close (no on-chain instruction; would require protocol change).
- Server-side code or proof storage (deliberately rejected; bearer-link model is the design).
- Indexer / historical archive of resolved private pools (revisit at >10k pools).
- Email/SMS sending integration (creator distributes links manually).
- Multi-signer creator pools (the program signs as a single creator; multisig support would need a Squads adapter, not in scope here).

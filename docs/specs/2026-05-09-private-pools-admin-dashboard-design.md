# Private Pools — Admin Dashboard + Discoverability — Design

**Date:** 2026-05-09
**Author:** AtlasBrain
**Status:** Approved (user thumbs-up 2026-05-09 on Sections 1–6 inline brainstorm)
**Repo:** [tombola-frontend](https://github.com/AtlasBrain/tombola-frontend)
**Branch:** `feat/private-pools-admin`
**Builds on:** [PR #10](https://github.com/AtlasBrain/tombola-frontend/pull/10) — private pools end-to-end UI (already merged to `main`)

---

## Goal

Close the two UX gaps surfaced after PR #10 shipped:

1. **Discoverability** — the public landing page has no link to `/create`. Users have to type the URL by hand to find the private-pools surface.
2. **Code recovery** — invite codes are generated client-side. If the creator navigates away from `/create` before saving them (the bug we just hit), they're unrecoverable. The pool exists; the codes are gone.

Plus deliver the natural extension: a **creator's admin dashboard** that re-displays the codes (sourced from localStorage), shows redemption status, lists participants, and provides simple CSS-based infographics.

## Non-goals

- Per-buyer code attribution ("which code did Alice use?"). Requires tx-history scan or off-chain log; not worth the complexity for v1.
- Time-series pot-growth chart. Per-batch slot lookups; punt.
- Cross-device code sync. localStorage is local — creators on a different machine CSV-export.
- Email/SMS resending of redemption links. Manual copy/paste only.
- IndexedDB fallback. 5000-code cap × ~150 bytes ≈ 750KB, fits comfortably in 5MB localStorage.
- Editing codes after creation. Protocol-immutable; can never be supported.
- Multi-pool aggregate dashboard ("all my pools at once"). The existing `/create/my-pools` list view already covers per-pool drill-in.

## Architecture

Pure frontend addition on top of the merged private-pools branch.

- **One new route** at `/create/my-pools/[pubkey]` — admin dashboard composition.
- **Two existing files edited** for discoverability — `Header.tsx` (nav item) and `page.tsx` (landing CTA).
- **One existing file edited** for codes-persistence flow — `CreatePoolForm.tsx` writes to localStorage on success.
- **One new lib file** — `src/lib/private-pool-storage.ts` — encapsulates localStorage read/write/list.
- **Five new components** under `src/components/` — dashboard, redemption status, top buyers, participant list, dashboard-stats grid.

No on-chain or SDK changes. All data sourced from `getProgramAccounts`, the typed account fetchers, and localStorage.

### Routing

| Route | Existing? | Purpose |
|---|---|---|
| `/create` | edit | Add a "you have unsaved codes for pool X" banner if localStorage has a pool the connected wallet created and that pool isn't yet Resolved |
| `/create/my-pools` | unchanged | List of creator's pools (already exists) |
| `/create/my-pools/[pubkey]` | **NEW** | Admin dashboard for one pool |
| `/pool/private/[pubkey]` | unchanged | Buyer/invitee view (no admin-only sections) |

The two surfaces stay separate by design. Creator can toggle between them via "View as buyer →" / "Admin dashboard →" links on each page.

## localStorage persistence

### Storage schema

**Key:** `tombola.privatePool.<base58_pool_address>`

**Value (JSON):**
```ts
{
  schemaVersion: 1,                     // migration cursor
  poolAddress: string,                  // sanity check vs key
  creator: string,                      // wallet that created — admin-gate cross-check
  createdAt: number,                    // unix seconds
  mode: "Whitelist" | "OneCodePerTicket",
  codes: string[],                      // hex codes
  proofs: Record<string, string>        // code → base64url proof
                                        // (Uint8Array isn't JSON-serializable;
                                        // store as base64url, decode on read)
}
```

### Lifecycle

- **Write** in `<CreatePoolForm>` immediately after `sendAndConfirm` succeeds, BEFORE invoking the existing `onCreated` callback. If the write throws (private-mode browser, quota exceeded), surface a toast: `"Browser blocked code storage; downloading CSV instead"` and trigger the CSV download as a fallback.
- **Read** in `<AdminDashboard>` on mount via `loadCodesFromStorage(poolAddress)`. Returns `null` if missing OR if `creator !== currentWallet` — prevents another wallet on the same browser from seeing the codes.
- **Read** in `<CreatePoolForm>` on mount — call `loadAllCodesForWallet(currentWallet)`, filter to entries whose pool is still `Open`, surface a banner: *"You have unsaved redemption links for pool <addr>. [Open admin dashboard]"*. One row per pool; click navigates to `/create/my-pools/[pubkey]`.
- **No deletion** in v1. Storage is creator-controlled. Browser dev-tools / "clear site data" wipes it. We never auto-prune.

### 5MB cap analysis

Worst case: 5000 codes per pool × ~150 bytes per JSON entry per pool ≈ **750KB per pool**. Even with 6 pools created from one wallet, that's ~4.5MB — within the 5MB cap. If a creator hits the cap, we surface a clear error and recommend exporting older pools' CSVs and clearing those entries manually. Hard limit; we don't add IndexedDB until someone actually hits it.

## Admin dashboard composition

`/create/my-pools/[pubkey]/page.tsx` is a thin server-friendly wrapper around `<AdminDashboard>` (client component). The page resolves `pubkey` from the dynamic segment, the component does all the data fetching.

```
┌─ Header (existing site Header.tsx, unchanged) ──────────────┐

┌─ AdminDashboard ────────────────────────────────────────────┐
│
│  Pool address · creator · access mode · state badge
│  "View as buyer →" link (anchor, not full nav)
│
│  ┌─ DashboardStats (4-card grid) ──────────────────────────┐
│  │ Pot │ Tickets │ Time to close │ Creator fee % set      │
│  └────────────────────────────────────────────────────────┘
│
│  ┌─ RedemptionStatus ─────────────────────────────────────┐
│  │ CSS bar: 3 / 10 redeemed  ▓▓▓░░░░░░░  30%             │
│  │
│  │ Unredeemed (7):
│  │   ▸ ab12cd…  [Copy link] [Copy code]
│  │   ▸ cd34ef…  [Copy link] [Copy code]
│  │   …
│  │
│  │ Redeemed (3):  [▸ collapsed by default]
│  │
│  │ [Copy all unredeemed links] [Download CSV — all]
│  │
│  │ Empty-state: if localStorage has no codes for this pool,
│  │ show: "Codes not in this browser's storage. They were
│  │   generated client-side at pool creation; if you didn't
│  │   save them, they're unrecoverable. [Reclaim rent →]"
│  │   (link points to /pool/private/[pubkey] where the
│  │    existing DrawWinnerButton's "Reclaim rent" path runs;
│  │    only useful if pool is past close_time + 0 tickets)
│  └────────────────────────────────────────────────────────┘
│
│  ┌─ TopBuyersBar ─────────────────────────────────────────┐
│  │ Pure CSS bar chart, top-5 buyers by ticket count:
│  │ EaALFp…  ████████████  6 tickets · 0.06 SOL
│  │ Q9aB7C…  ██████        3 tickets · 0.03 SOL
│  │ …
│  │
│  │ Total: 4 wallets · 12 tickets · 0.12 SOL pot
│  └────────────────────────────────────────────────────────┘
│
│  ┌─ ParticipantList (full table, scrollable) ────────────┐
│  │ Wallet              │ Tickets │ Spent     │ Explorer  │
│  │ EaALFp…             │ 6       │ 0.06 SOL  │ ↗         │
│  │ Q9aB7C…             │ 3       │ 0.03 SOL  │ ↗         │
│  │ …
│  └────────────────────────────────────────────────────────┘
│
└─────────────────────────────────────────────────────────────┘
```

### Component breakdown (new files)

| File | Responsibility |
|---|---|
| `src/lib/private-pool-storage.ts` | `saveCodes()`, `loadCodes(pool)`, `loadAllCodesForWallet(wallet)`, `removeCodes(pool)`. Schema validation. base64url encode/decode for proofs. |
| `src/lib/private-pool-storage.test.ts` | Unit tests for round-trip, schema validation, wallet-filter, base64url encoding. |
| `src/components/AdminDashboard.tsx` | Top-level composition. Fetches pool + batches + redeemed-codes. Permission gate. Renders the four child sections. |
| `src/components/AdminDashboardStats.tsx` | 4-card grid (pot, tickets, time-to-close, fee %). Reuses the `<Stat>` helper from the buyer page. Prefixed `Admin` to distinguish from the existing `StatsBar.tsx`. |
| `src/components/AdminRedemptionStatus.tsx` | Code list + bar chart + copy/CSV. Two-tier list (unredeemed default-expanded, redeemed default-collapsed). Empty-state for no-localStorage case. |
| `src/components/AdminTopBuyersBar.tsx` | Top-5 CSS bar chart from buyer aggregation. Pure CSS — no chart library. |
| `src/components/AdminParticipantList.tsx` | Full scrollable table. One row per unique buyer. Includes explorer link. |
| `src/app/create/my-pools/[pubkey]/page.tsx` | Page wrapper that renders `<AdminDashboard>`. |

### Component reuses (no edits)

Wallet adapter, `Header.tsx`, `Toast.tsx` (toasts), `Countdown.tsx`, `LivePoolWatcher.tsx` (live updates), `PrivatePoolCard.tsx`, `format.ts` (`formatSol`, `formatTickets`), `explorer-url.ts`, vendored SDK at `vendor/sdk/`.

## On-chain reads

When `<AdminDashboard>` mounts (and again on `LivePoolWatcher`-triggered refresh):

```ts
const [pool, batchAccounts, redeemedAccounts] = await Promise.all([
  fetchPrivatePool(rpc, poolPda),
  rpc.getProgramAccounts(programId, {
    filters: [
      { dataSize: TICKET_BATCH_SIZE },
      { memcmp: { offset: 8 /* skip disc */, bytes: poolPda } },
      // batch.pool is the first field after disc → offset 8, 32 bytes
    ],
    encoding: "base64",
  }).send(),
  rpc.getProgramAccounts(programId, {
    filters: [
      { dataSize: REDEEMED_CODE_SIZE },
      { memcmp: { offset: 8, bytes: poolPda } },
      // RedeemedCode.pool is the first field after disc → offset 8
    ],
    encoding: "base64",
  }).send(),
]);
```

### Per-buyer aggregation (client-side)

Decode each TicketBatch via the SDK's `fetchTicketBatch` (or batch-decode raw bytes), then:

```ts
const byOwner = new Map<string, { tickets: bigint; spent: bigint }>();
for (const batch of batches) {
  const ticketCount = batch.lastTicketId - batch.firstTicketId + 1n;
  const spent = ticketCount * pool.ticketPrice;
  const cur = byOwner.get(batch.owner) ?? { tickets: 0n, spent: 0n };
  byOwner.set(batch.owner, {
    tickets: cur.tickets + ticketCount,
    spent: cur.spent + spent,
  });
}
const participants = [...byOwner.entries()]
  .map(([owner, agg]) => ({ owner, ...agg }))
  .sort((a, b) => Number(b.tickets - a.tickets));
```

### Code redemption mapping (client-side)

For each code in localStorage, compute `hash_leaf(code)` (using the SDK's already-exported helper), derive the `RedeemedCode` PDA (`[redeem, pool, code_hash]`), check membership in the fetched `redeemedAccounts` set. The result is a `Map<code, redeemed: boolean>` rendered into the two-tier list.

### Permission gate

```ts
if (!publicKey) return <ConnectWalletPrompt />;
if (publicKey.toBase58() !== pool.creator) {
  return (
    <NotCreatorPanel poolPda={pubkey} />  // "Only the creator can view this dashboard. [Open buyer view →]"
  );
}
```

Frontend-only gate. All data the dashboard surfaces (participants, batch ownership, redemption status) is on-chain public — anyone can derive it via `getProgramAccounts`. The gate is polish, not security.

## Code-flow integration

### `<CreatePoolForm>` modifications (one file diff)

After `sendAndConfirm` succeeds, before invoking `onCreated`:

```ts
saveCodesToStorage({
  poolAddress,
  creator: publicKey.toBase58(),
  createdAt: Math.floor(Date.now() / 1000),
  mode,
  codes,
  proofs: Object.fromEntries(
    Object.entries(proofMap).map(([code, proof]) => [
      code,
      proofConcatToBase64Url(proof),  // reuses existing base64url helper
    ]),
  ),
});
```

If `saveCodesToStorage` throws (private-mode browser, quota exceeded), trigger CSV download as fallback + toast.

On mount, the form also calls `loadAllCodesForWallet(currentWallet)` and surfaces a banner per pool that's still `Open` — *"You have unsaved redemption links for pool X. [Open admin dashboard]"*. Click → `/create/my-pools/<pool>`.

### `<RedemptionLinkList>` (existing) — no code change

Already reads codes/proofs from props. The `/create` page success block now also includes a primary CTA: **"Open admin dashboard →"** linking to `/create/my-pools/<pubkey>`, alongside the existing "View as buyer →" link.

## Discoverability fix

### Header nav (one file diff)

`src/components/Header.tsx` — extend `NAV_ITEMS` with a non-anchor entry:

```tsx
{ id: "private", label: "PRIVATE", href: "/create" }
```

The existing entries use same-page anchors (`<a href="#pools" onClick={smoothScroll}>`); the new one uses Next.js `<Link href="/create">`. Conditional render in the map: anchor for `id` items, `Link` for `href` items.

### Landing-page CTA (one file diff)

`src/app/page.tsx` — add a small section below the public-pools grid, above `<HowItWorks>`:

```tsx
<section className="mx-auto max-w-7xl px-6 pb-20">
  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center">
    <h3 className="font-display text-3xl uppercase">Host your own raffle</h3>
    <p className="mt-2 text-sm text-neutral-400">
      Mint invite codes and run a private pool. You set the price, duration, and creator fee.
    </p>
    <Link
      href="/create"
      className="mt-6 inline-flex rounded bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
    >
      Create a private pool →
    </Link>
  </div>
</section>
```

Both surfaces (header + landing CTA) ship together. Either alone would be discoverable, but together hits both "I'm scanning the page" and "I'm scanning the nav" mental models.

## Error handling

| Error | UX |
|---|---|
| Wallet not connected on `/create/my-pools/[pubkey]` | Connect-wallet prompt instead of dashboard |
| Connected wallet ≠ pool creator | "Only the creator can view this dashboard" panel + `[Open buyer view →]` |
| Pool not found on chain | "Pool not found" panel (matching the existing `/pool/private/[pubkey]` error UX) |
| `getProgramAccounts` fails (network) | Inline red message + retry button |
| localStorage missing for this pool | Empty-state in RedemptionStatus only ("Codes not in this browser's storage. [Reclaim rent →]"); rest of dashboard still renders |
| localStorage write fails (quota / private-mode) | Trigger CSV download + toast warning |
| TicketBatch decode error | Skip that batch, log to console, render others |
| `LivePoolWatcher` subscription fails | Silently fall back to mount-time fetch only — same behavior as the existing pool detail page |

All toasts use the existing `Toast.tsx` layer.

## Testing

### Unit (vitest)
- `private-pool-storage.test.ts` — round-trip save/load, base64url proof encode/decode, wallet-filter, schema-version handling, missing key returns null
- Existing `private-pools.test.ts` — unchanged

### Component (testing-library + happy-dom)
- `AdminDashboard.test.tsx` — wallet-not-connected → connect prompt; wrong-wallet → not-creator panel; correct wallet → fetches + renders sections
- `RedemptionStatus.test.tsx` — empty-state when localStorage missing; correctly partitions redeemed vs unredeemed; copy + CSV actions fire
- `TopBuyersBar.test.tsx` — top-5 truncation; "Total: N wallets" footer

### Manual devnet E2E
- Already-tested flow: create pool → grab pool address → navigate to `/create/my-pools/<address>` → verify codes display + 0 participants + countdown
- After a buyer redeems via the existing `/redeem` flow → refresh admin dashboard → verify (a) the buyer's wallet shows in ParticipantList, (b) the redeemed code moves from "Unredeemed (N)" to "Redeemed (N)" section, (c) TopBuyersBar updates

## Risks + mitigations

- **localStorage cleared / different machine** — codes lost forever. Mitigation: form's CSV-download button on creation (existing) + auto-CSV-download fallback if localStorage write fails. We document this in a banner on `/create`. Cross-device sync is explicitly out of scope.
- **Quota exhaustion at scale** — see 5MB analysis above. Mitigation: error message recommending CSV export + manual cleanup. Hard cap; no IndexedDB until needed.
- **Wallet swap (creator's hot wallet rotated)** — old wallet's localStorage still has codes; new wallet can't see them. Mitigation: `loadAllCodesForWallet` filters by creator field; user has to either re-import via CSV or operate from the original device.
- **`getProgramAccounts` on a busy RPC** — large pools (thousands of TicketBatches) hit RPC limits. Mitigation: 1k-leaf cap on pool size enforced in form (effective via 5000 code cap, but ticket batches are typically << codes). Helius dedicated RPC handles this trivially.
- **Race between buyer's redemption tx and admin dashboard refresh** — same-tab live-updates work via `LivePoolWatcher`; other tabs require manual refresh. Acceptable — on-chain state is always source of truth, the dashboard is a view.

## Implementation order (suggested for the plan)

1. `private-pool-storage.ts` + tests — foundation
2. `<CreatePoolForm>` save-on-success modification + storage banner
3. Header + landing-page nav/CTA additions (smaller; can land second to make /create reachable for testers)
4. `<DashboardStats>` + `<AdminDashboard>` shell + permission gate + page.tsx
5. `<RedemptionStatus>` (codes from localStorage + on-chain redemption check)
6. `<TopBuyersBar>` + `<ParticipantList>` (on-chain TicketBatch reads + aggregation)
7. Manual devnet E2E + final hygiene + PR

This order delivers a usable end-to-end flow at step 6; step 7 is verification.

## Out of scope

- Per-buyer code attribution (which code did Alice use?)
- Time-series pot growth charts
- Email/SMS resending of redemption links
- Pool deletion before close (protocol-immutable)
- Editing creator fee or duration after creation (protocol-immutable)
- Cross-device code sync
- IndexedDB fallback (not needed at v1 scale)
- Server-side code or proof storage
- Multi-pool aggregate dashboard (per-pool drill-in is the path)

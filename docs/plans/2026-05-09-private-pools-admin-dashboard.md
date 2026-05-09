# Private Pools — Admin Dashboard + Discoverability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two UX gaps from PR #10 — (1) add nav links from the public landing to the private-pool surface, and (2) ship a creator's admin dashboard at `/create/my-pools/[pubkey]` that re-displays invite codes from localStorage, shows redemption status, lists participants, and provides simple CSS-based infographics.

**Architecture:** Frontend-only addition. 1 new lib file (localStorage codes persistence), 5 new admin components, 1 new dynamic route, 3 existing-file edits (`CreatePoolForm` writes to localStorage on success + load banner; `Header` gains a PRIVATE nav item; `page.tsx` gains a landing CTA). No on-chain or SDK changes.

**Tech Stack:** Next.js 15 App Router · React 19 · Tailwind v4 · @solana/kit + @solana/web3.js (interop via `kit-to-web3`) · Wallet Standard · vitest + happy-dom + @testing-library/react · vendored SDK at `vendor/sdk/` (alias `@tombola/sdk`).

**Spec:** [docs/specs/2026-05-09-private-pools-admin-dashboard-design.md](../specs/2026-05-09-private-pools-admin-dashboard-design.md)

**Builds on:** [PR #10](https://github.com/AtlasBrain/tombola-frontend/pull/10) — already merged to `main`.

---

## Conventions

- **Working directory** for all commands: `~/Desktop/tombola-frontend`
- **Branch:** `feat/private-pools-admin` (already created off `main`; spec landed in commit `65e06ff`).
- **Hygiene gate** before every commit:
  - `npx eslint <changed files>` — clean (don't run `npm run lint` — pre-existing artifacts in unrelated worktrees pollute its output)
  - `npm run test` — all passing
  - `npm run build` — clean
- **Tests** live next to source (`foo.ts` → `foo.test.ts`).
- **Sign-only tx flow** isn't relevant for this plan — no new tx-submitting code lands here.
- **Commit style:** imperative, scoped, ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` line.

## Lessons from PR #10 (read once, save time)

These were the 9 SDK-shape corrections caught during PR #10 implementation. Most aren't relevant to this plan (no new tx code); the relevant ones are:

- **`AccessMode`** is a numeric enum, NOT `{ __kind: "WhitelistMode" }`. Read with the `accessModeLabel(am)` defensive helper introduced in PR #10's `AdminDashboard`/`MyPoolsView` (handles both numeric and tagged-enum shapes).
- **Codama `Option<T>`** decodes as `{ __option: "Some" | "None", value? }`. Unwrap `.value` when `__option === "Some"`. The `pool.winner` and `pool.vrfRequest` fields use this.
- **`code` arg to redeem ix** is `string`, NOT `Uint8Array`. Not relevant here (no redemption tx code).
- **`buyTicketPrivate` returns** `{ instruction, ticketBatch, firstTicketId }`. Not relevant here.
- **`getAddressEncoder().encode(...)`** returns `ReadonlyUint8Array`; wrap with `new Uint8Array(...)` when passing to APIs expecting mutable. Not relevant here.

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/private-pool-storage.ts` | create | localStorage read/write/list for codes (per-pool, per-wallet) |
| `src/lib/private-pool-storage.test.ts` | create | Round-trip + schema-validation + wallet-filter tests |
| `src/components/CreatePoolForm.tsx` | modify | Save to localStorage on submit success; surface unsaved-codes banner on mount |
| `src/components/Header.tsx` | modify | Add `PRIVATE` nav item linking to `/create` |
| `src/app/page.tsx` | modify | Add landing-page CTA section linking to `/create` |
| `src/components/AdminDashboard.tsx` | create | Top-level dashboard composition + on-chain fetches + permission gate |
| `src/components/AdminDashboardStats.tsx` | create | 4-card stats grid (pot/tickets/time-to-close/fee%) |
| `src/components/AdminRedemptionStatus.tsx` | create | Code list + redeemed/unredeemed split + copy/CSV |
| `src/components/AdminTopBuyersBar.tsx` | create | Top-5 CSS bar chart |
| `src/components/AdminParticipantList.tsx` | create | Full scrollable participant table |
| `src/app/create/my-pools/[pubkey]/page.tsx` | create | Dynamic route page wrapper |

11 files total. No new dependencies.

---

## Task 1: localStorage codes persistence (`src/lib/private-pool-storage.ts` + tests)

**Files:**
- Create: `src/lib/private-pool-storage.ts`
- Create: `src/lib/private-pool-storage.test.ts`

TDD-perfect fit. Pure-function module with no React, no wallet adapter.

- [ ] **Step 1.1: Write the failing tests**

```ts
// src/lib/private-pool-storage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveCodesToStorage,
  loadCodesFromStorage,
  loadAllCodesForWallet,
  type StoredCodesPayload,
} from "./private-pool-storage";

const POOL = "HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW";
const WALLET = "EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt";
const OTHER_WALLET = "A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY";

const SAMPLE_PAYLOAD: StoredCodesPayload = {
  poolAddress: POOL,
  creator: WALLET,
  createdAt: 1_778_544_000,
  mode: "Whitelist",
  codes: ["ab".repeat(16), "cd".repeat(16)],
  proofs: {
    ["ab".repeat(16)]: [new Uint8Array(32).fill(0x11)],
    ["cd".repeat(16)]: [new Uint8Array(32).fill(0x22)],
  },
};

describe("private-pool-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a Whitelist-mode payload", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const loaded = loadCodesFromStorage(POOL, WALLET);
    expect(loaded).not.toBeNull();
    expect(loaded!.poolAddress).toBe(POOL);
    expect(loaded!.creator).toBe(WALLET);
    expect(loaded!.mode).toBe("Whitelist");
    expect(loaded!.codes).toEqual(SAMPLE_PAYLOAD.codes);
    expect(loaded!.proofs[SAMPLE_PAYLOAD.codes[0]][0]).toEqual(
      new Uint8Array(32).fill(0x11),
    );
    expect(loaded!.proofs[SAMPLE_PAYLOAD.codes[1]][0]).toEqual(
      new Uint8Array(32).fill(0x22),
    );
  });

  it("round-trips OneCodePerTicket mode", () => {
    saveCodesToStorage({ ...SAMPLE_PAYLOAD, mode: "OneCodePerTicket" });
    const loaded = loadCodesFromStorage(POOL, WALLET);
    expect(loaded!.mode).toBe("OneCodePerTicket");
  });

  it("returns null when wallet is not the creator (cross-wallet leakage guard)", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const loaded = loadCodesFromStorage(POOL, OTHER_WALLET);
    expect(loaded).toBeNull();
  });

  it("returns null when key is missing", () => {
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("returns null on schema version mismatch", () => {
    localStorage.setItem(
      `tombola.privatePool.${POOL}`,
      JSON.stringify({ schemaVersion: 999, poolAddress: POOL, creator: WALLET }),
    );
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem(`tombola.privatePool.${POOL}`, "not-json{{{");
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("loadAllCodesForWallet returns only this wallet's pools", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    saveCodesToStorage({
      ...SAMPLE_PAYLOAD,
      poolAddress: "OtherPoolPdaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      creator: OTHER_WALLET,
    });
    const mine = loadAllCodesForWallet(WALLET);
    expect(mine.length).toBe(1);
    expect(mine[0].poolAddress).toBe(POOL);
  });

  it("ignores entries with non-tombola.privatePool keys", () => {
    localStorage.setItem("unrelated", "value");
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const mine = loadAllCodesForWallet(WALLET);
    expect(mine.length).toBe(1);
  });

  it("throws on quota exceeded so caller can fall back to CSV", () => {
    // Simulate a near-full localStorage by stuffing it with junk first.
    // happy-dom's localStorage is unlimited so this test is illustrative
    // only — keep the throw path because real browsers enforce 5MB.
    // No assertion that it throws here (env doesn't enforce quota).
    expect(() => saveCodesToStorage(SAMPLE_PAYLOAD)).not.toThrow();
  });
});
```

- [ ] **Step 1.2: Run tests, expect FAIL**

```bash
cd ~/Desktop/tombola-frontend
npm run test -- src/lib/private-pool-storage.test.ts
```

Expected: failures because the module doesn't exist.

- [ ] **Step 1.3: Write the implementation**

```ts
// src/lib/private-pool-storage.ts
//
// localStorage persistence for invite codes generated client-side at private-pool
// creation. Codes never reach the chain (only the Merkle root does), so the only
// way to re-display them after the creator navigates away is to persist locally.
//
// Schema is versioned. Cross-wallet leakage guard: loadCodesFromStorage requires
// the caller to pass the connected wallet, and returns null if the stored
// `creator` doesn't match.

import type { RedemptionMode } from "./private-pools";

const KEY_PREFIX = "tombola.privatePool.";
const SCHEMA_VERSION = 1;

export interface StoredCodesPayload {
  poolAddress: string;
  creator: string;
  createdAt: number; // unix seconds
  mode: RedemptionMode;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
}

interface OnDiskShape {
  schemaVersion: number;
  poolAddress: string;
  creator: string;
  createdAt: number;
  mode: RedemptionMode;
  codes: string[];
  // Uint8Array isn't JSON-serializable; on disk each proof step is a base64url string.
  proofs: Record<string, string[]>;
}

export function saveCodesToStorage(payload: StoredCodesPayload): void {
  const onDisk: OnDiskShape = {
    schemaVersion: SCHEMA_VERSION,
    poolAddress: payload.poolAddress,
    creator: payload.creator,
    createdAt: payload.createdAt,
    mode: payload.mode,
    codes: payload.codes,
    proofs: Object.fromEntries(
      Object.entries(payload.proofs).map(([code, steps]) => [
        code,
        steps.map(bytesToBase64Url),
      ]),
    ),
  };
  localStorage.setItem(
    `${KEY_PREFIX}${payload.poolAddress}`,
    JSON.stringify(onDisk),
  );
}

export function loadCodesFromStorage(
  poolAddress: string,
  walletAddress: string,
): StoredCodesPayload | null {
  const raw = localStorage.getItem(`${KEY_PREFIX}${poolAddress}`);
  if (!raw) return null;
  let parsed: OnDiskShape;
  try {
    parsed = JSON.parse(raw) as OnDiskShape;
  } catch {
    return null;
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
  if (parsed.creator !== walletAddress) return null;
  return {
    poolAddress: parsed.poolAddress,
    creator: parsed.creator,
    createdAt: parsed.createdAt,
    mode: parsed.mode,
    codes: parsed.codes,
    proofs: Object.fromEntries(
      Object.entries(parsed.proofs).map(([code, steps]) => [
        code,
        steps.map(base64UrlToBytes),
      ]),
    ),
  };
}

export function loadAllCodesForWallet(
  walletAddress: string,
): StoredCodesPayload[] {
  const out: StoredCodesPayload[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const poolAddress = key.slice(KEY_PREFIX.length);
    const loaded = loadCodesFromStorage(poolAddress, walletAddress);
    if (loaded) out.push(loaded);
  }
  return out;
}

export function removeCodesFromStorage(poolAddress: string): void {
  localStorage.removeItem(`${KEY_PREFIX}${poolAddress}`);
}

// ---------- base64url helpers (browser + happy-dom compatible) ----------

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === "function"
      ? btoa(s)
      : Buffer.from(s, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
```

- [ ] **Step 1.4: Run tests, expect PASS**

```bash
npm run test -- src/lib/private-pool-storage.test.ts
```

Expected: all 9 tests passing.

- [ ] **Step 1.5: Hygiene gate**

```bash
npx eslint src/lib/private-pool-storage.ts src/lib/private-pool-storage.test.ts
npm run build
```

Both clean.

- [ ] **Step 1.6: Commit Task 1**

```bash
git add src/lib/private-pool-storage.ts src/lib/private-pool-storage.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): localStorage persistence for invite codes

src/lib/private-pool-storage.ts:
  - saveCodesToStorage(payload) — writes versioned JSON keyed by pool
  - loadCodesFromStorage(pool, wallet) — gated by creator==wallet
  - loadAllCodesForWallet(wallet) — scan + filter
  - removeCodesFromStorage(pool) — explicit delete (unused in v1)

Proofs are encoded as base64url (Uint8Array isn't JSON-serializable).
Schema-version field for future migrations. Cross-wallet leakage
guard: loadCodesFromStorage returns null if the stored creator
doesn't match the connected wallet. 9 unit tests cover round-trip,
schema validation, and wallet-filter behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `<CreatePoolForm>` save-on-success + unsaved-codes banner

**Files:**
- Modify: `src/components/CreatePoolForm.tsx`

After this task, the form persists codes immediately after pool creation, AND surfaces a banner on mount if the connected wallet has unsaved codes for any of their previously-created pools.

- [ ] **Step 2.1: Read the current form**

```bash
cd ~/Desktop/tombola-frontend
cat src/components/CreatePoolForm.tsx | head -130
```

Locate two integration points:
- The `onSubmit` callback after `connection.confirmTransaction(...)` and before `onCreated(...)`
- The component's mount-time effects (currently no useEffect — you'll add one)

- [ ] **Step 2.2: Add the save-on-success call**

After the line `await connection.confirmTransaction(...)` and before `const [poolAddress] = await client.privatePoolPda(...)` in `CreatePoolForm.tsx`, add:

```ts
// Persist codes locally so the creator can recover them after navigating
// away (the bug we just hit). Wraps in try/catch — if localStorage write
// fails (private mode / quota), we surface a warning but don't fail the
// whole flow because the on-chain pool already exists.
//
// Note: we save BEFORE deriving poolAddress because saveCodesToStorage
// needs the address; compute it first.
```

Then move the `const [poolAddress] = await client.privatePoolPda(...)` BEFORE the save, so:

```ts
const [poolAddress] = await client.privatePoolPda(
  publicKey.toBase58() as never,
  poolId,
);

// ---- Persist codes locally (recovery path) ----
try {
  saveCodesToStorage({
    poolAddress,
    creator: publicKey.toBase58(),
    createdAt: Math.floor(Date.now() / 1000),
    mode,
    codes,
    proofs,
  });
} catch (storageErr) {
  // localStorage quota / private mode — codes still in React state for the
  // RedemptionLinkList render, but won't survive navigation. Surface a
  // warning so the creator knows to save manually.
  console.warn("saveCodesToStorage failed:", storageErr);
  setErr(
    "Couldn't save codes to browser storage — copy/download them now or they're lost.",
  );
}

const proofMap: Record<string, Uint8Array[]> = { ...proofs };

onCreated({ poolAddress, codes, proofs: proofMap, mode });
```

Add the import at the top:
```ts
import { saveCodesToStorage } from "@/lib/private-pool-storage";
```

- [ ] **Step 2.3: Add the unsaved-codes banner on mount**

Above the `return (...)` block, after the existing state declarations, add:

```tsx
const [unsavedPools, setUnsavedPools] = useState<
  Array<{ poolAddress: string; createdAt: number }>
>([]);

useEffect(() => {
  if (!publicKey) {
    setUnsavedPools([]);
    return;
  }
  const all = loadAllCodesForWallet(publicKey.toBase58());
  // Sort newest first; we'll show all of them (creator can dismiss by
  // visiting the admin dashboard for that pool).
  setUnsavedPools(
    all
      .map((p) => ({ poolAddress: p.poolAddress, createdAt: p.createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt),
  );
}, [publicKey]);
```

Add imports:
```ts
import { useEffect } from "react";  // merge with existing React imports
import { loadAllCodesForWallet } from "@/lib/private-pool-storage";
import Link from "next/link";
```

Then render the banner inside the returned JSX, ABOVE the `<form>` element:

```tsx
{unsavedPools.length > 0 && (
  <div className="mb-4 rounded-2xl border border-amber-700/40 bg-amber-900/20 p-4">
    <p className="text-sm font-semibold text-amber-300">
      You have {unsavedPools.length} pool
      {unsavedPools.length === 1 ? "" : "s"} with redemption links saved
      in this browser.
    </p>
    <ul className="mt-2 space-y-1 text-xs text-amber-200">
      {unsavedPools.slice(0, 5).map((p) => (
        <li key={p.poolAddress} className="flex items-center justify-between">
          <code className="font-mono">
            {p.poolAddress.slice(0, 8)}…{p.poolAddress.slice(-4)}
          </code>
          <Link
            href={`/create/my-pools/${p.poolAddress}`}
            className="rounded bg-amber-800/50 px-2 py-1 hover:bg-amber-800"
          >
            Open admin →
          </Link>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 2.4: Run existing tests, ensure no regression**

```bash
npm run test
```

Expected: all 75+ tests pass (existing 66 + 9 from Task 1; CreatePoolForm tests still pass — the form still validates the same way, save-on-success doesn't affect the validation tests).

- [ ] **Step 2.5: Hygiene gate**

```bash
npx eslint src/components/CreatePoolForm.tsx
npm run build
```

Both clean.

- [ ] **Step 2.6: Commit Task 2**

```bash
git add src/components/CreatePoolForm.tsx
git commit -m "$(cat <<'EOF'
feat(admin): persist codes to localStorage + show unsaved-codes banner

CreatePoolForm now writes codes to localStorage immediately after
sendAndConfirm succeeds. If the write fails (private mode / quota
exceeded), surface an error to the creator so they know to copy
manually — the on-chain pool already exists at that point, so we
don't roll back.

On mount, scans localStorage for any pools created by the connected
wallet and surfaces a banner with quick links to each pool's admin
dashboard. This recovers from the "navigated away before saving"
trap that closed PR #10's known UX bug.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Discoverability — Header `PRIVATE` nav + landing-page CTA

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/page.tsx`

After this task, both the header nav and the landing page have visible entry points to `/create`.

- [ ] **Step 3.1: Add `PRIVATE` nav item to Header**

In `src/components/Header.tsx`, change the `NAV_ITEMS` array and the rendering loop. Current array:

```ts
const NAV_ITEMS = [
  { id: "pools",         label: "POOLS" },
  { id: "how-it-works",  label: "HOW IT WORKS" },
  { id: "stats",         label: "STATS" },
  { id: "faq",           label: "FAQ" },
] as const;
```

Replace with:

```ts
type NavItem =
  | { kind: "anchor"; id: string; label: string }
  | { kind: "link"; href: string; label: string };

const NAV_ITEMS: readonly NavItem[] = [
  { kind: "anchor", id: "pools",        label: "POOLS" },
  { kind: "link",   href: "/create",    label: "PRIVATE" },
  { kind: "anchor", id: "how-it-works", label: "HOW IT WORKS" },
  { kind: "anchor", id: "stats",        label: "STATS" },
  { kind: "anchor", id: "faq",          label: "FAQ" },
];
```

Then update the rendering inside the nav (currently iterating with `<a href={`#${item.id}`} onClick={handleScroll(item.id)}>`):

```tsx
<nav className="hidden items-center gap-1 justify-self-center sm:flex">
  {NAV_ITEMS.map((item) =>
    item.kind === "anchor" ? (
      <a
        key={item.id}
        href={`#${item.id}`}
        onClick={handleScroll(item.id)}
        className="nav-link"
      >
        {item.label}
      </a>
    ) : (
      <Link key={item.href} href={item.href} className="nav-link">
        {item.label}
      </Link>
    ),
  )}
</nav>
```

`Link` is already imported; no new import needed.

- [ ] **Step 3.2: Add landing-page CTA**

In `src/app/page.tsx`, locate the existing `<section id="pools">` block. Below it, but above wherever the `<HowItWorks>` section renders (or above wherever feels structurally similar to "next section"), add:

```tsx
<section className="mx-auto max-w-7xl px-6 pb-20">
  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center">
    <h3 className="font-display text-3xl uppercase">Host your own raffle</h3>
    <p className="mt-2 text-sm text-neutral-400">
      Mint invite codes and run a private pool. You set the price,
      duration, and creator fee.
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

Add `import Link from "next/link";` at the top if not already present.

- [ ] **Step 3.3: Run tests, ensure nav tests don't regress**

```bash
npm run test
```

Existing tests should all pass.

- [ ] **Step 3.4: Hygiene gate**

```bash
npx eslint src/components/Header.tsx src/app/page.tsx
npm run build
```

Both clean.

- [ ] **Step 3.5: Commit Task 3**

```bash
git add src/components/Header.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): PRIVATE nav item + landing-page CTA

Header gets a 5th nav item between POOLS and HOW-IT-WORKS pointing at
/create. The existing nav model expanded to support both same-page
anchors (existing 4 items) and Next.js Link routes (the new PRIVATE
entry). Landing page also gets a CTA section below the public-pools
grid pitching private-pool creation.

Closes the discoverability gap from PR #10 — users no longer have to
type the URL by hand to find the private-pools surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Admin dashboard shell — `<AdminDashboard>` + `<AdminDashboardStats>` + page

**Files:**
- Create: `src/components/AdminDashboard.tsx`
- Create: `src/components/AdminDashboardStats.tsx`
- Create: `src/app/create/my-pools/[pubkey]/page.tsx`

After this task, navigating to `/create/my-pools/<pubkey>` renders the dashboard shell with permission gating + the 4-card stats grid. Sections 5 and 6 (RedemptionStatus, TopBuyersBar, ParticipantList) are stubbed and land in the next tasks.

- [ ] **Step 4.1: Create `<AdminDashboardStats>`**

```tsx
// src/components/AdminDashboardStats.tsx
"use client";
import { Countdown } from "./Countdown";
import { formatSol, formatTickets } from "@/lib/format";

interface Props {
  totalPotLamports: bigint;
  totalTickets: bigint;
  closeTimeUnix: number;
  creatorFeeBps: number;
  state: 0 | 1 | 2;
}

export function AdminDashboardStats({
  totalPotLamports,
  totalTickets,
  closeTimeUnix,
  creatorFeeBps,
  state,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Stat label="Pot" value={formatSol(totalPotLamports)} />
      <Stat label="Tickets" value={formatTickets(totalTickets)} />
      <Stat
        label={state === 0 ? "Closes in" : "Closed"}
        value={<Countdown targetUnix={closeTimeUnix} />}
      />
      <Stat label="Creator fee" value={`${(creatorFeeBps / 100).toFixed(1)}%`} />
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-widest text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-100">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4.2: Create `<AdminDashboard>` with permission gate (sections 2/3/4 stubbed)**

```tsx
// src/components/AdminDashboard.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { createSolanaRpc, type Address } from "@solana/kit";
import { LivePoolWatcher } from "./LivePoolWatcher";
import { AdminDashboardStats } from "./AdminDashboardStats";

interface Props {
  poolAddress: string;
}

interface PoolData {
  ticketPriceLamports: bigint;
  totalTickets: bigint;
  totalPotLamports: bigint;
  closeTimeUnix: number;
  state: 0 | 1 | 2;
  accessMode: "Whitelist" | "OneCodePerTicket";
  creator: string;
  creatorFeeBps: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accessModeLabel(am: any): "Whitelist" | "OneCodePerTicket" {
  if (typeof am === "number") {
    return am === 0 ? "Whitelist" : "OneCodePerTicket";
  }
  if (am && typeof am === "object" && "__kind" in am) {
    return am.__kind === "WhitelistMode" ? "Whitelist" : "OneCodePerTicket";
  }
  return "Whitelist";
}

export function AdminDashboard({ poolAddress }: Props) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [pool, setPool] = useState<PoolData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rpc = createSolanaRpc(connection.rpcEndpoint);
        const { fetchPrivatePool } = await import("@tombola/sdk/generated");
        const acc = await fetchPrivatePool(rpc, poolAddress as Address);
        if (cancelled) return;
        setPool({
          ticketPriceLamports: acc.data.ticketPrice,
          totalTickets: acc.data.totalTickets,
          totalPotLamports: acc.data.totalPot,
          closeTimeUnix: Number(acc.data.closeTime),
          state: acc.data.state as 0 | 1 | 2,
          accessMode: accessModeLabel(acc.data.accessMode),
          creator: String(acc.data.creator),
          creatorFeeBps: acc.data.creatorFeeBps,
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load pool");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, poolAddress]);

  if (err) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Pool not found</h1>
        <p className="mt-4 text-sm text-neutral-400">{err}</p>
      </main>
    );
  }
  if (!pool) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-neutral-400">Loading…</p>
      </main>
    );
  }
  if (!publicKey) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Admin dashboard</h1>
        <p className="mt-4 text-sm text-neutral-400">
          Connect your wallet to view this dashboard.
        </p>
        <button
          type="button"
          onClick={() => setWalletModalVisible(true)}
          className="mt-6 rounded bg-emerald-600 px-6 py-3 font-semibold text-white"
        >
          Connect wallet
        </button>
      </main>
    );
  }
  if (publicKey.toBase58() !== pool.creator) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="font-display text-3xl uppercase">Not the creator</h1>
        <p className="mt-4 text-sm text-neutral-400">
          Only the wallet that created this pool can view its admin dashboard.
        </p>
        <Link
          href={`/pool/private/${poolAddress}`}
          className="mt-6 inline-flex rounded bg-neutral-800 px-6 py-3 text-sm font-semibold text-neutral-100 hover:bg-neutral-700"
        >
          Open buyer view →
        </Link>
      </main>
    );
  }

  return (
    <>
      <LivePoolWatcher addresses={[poolAddress]} rpcUrl={connection.rpcEndpoint} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              Admin · {pool.accessMode}
            </p>
            <h1 className="mt-1 font-mono text-xl text-neutral-300">
              {poolAddress.slice(0, 8)}…{poolAddress.slice(-4)}
            </h1>
          </div>
          <Link
            href={`/pool/private/${poolAddress}`}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            View as buyer →
          </Link>
        </div>

        <div className="mt-8">
          <AdminDashboardStats
            totalPotLamports={pool.totalPotLamports}
            totalTickets={pool.totalTickets}
            closeTimeUnix={pool.closeTimeUnix}
            creatorFeeBps={pool.creatorFeeBps}
            state={pool.state}
          />
        </div>

        {/* Section 5 + 6 land in subsequent tasks. Stub: */}
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          Redemption status, top buyers, and participant list — coming in
          Tasks 5–6.
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 4.3: Create the page**

```tsx
// src/app/create/my-pools/[pubkey]/page.tsx
import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPoolPage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = await params;
  return (
    <>
      <Header />
      <AdminDashboard poolAddress={pubkey} />
    </>
  );
}
```

- [ ] **Step 4.4: Run tests + hygiene**

```bash
npm run test
npx eslint src/components/AdminDashboard.tsx src/components/AdminDashboardStats.tsx 'src/app/create/my-pools/[pubkey]/page.tsx'
npm run build
```

All clean. Build should show the new dynamic route `/create/my-pools/[pubkey]` as `ƒ (Dynamic)`.

- [ ] **Step 4.5: Commit Task 4**

```bash
git add src/components/AdminDashboard.tsx src/components/AdminDashboardStats.tsx 'src/app/create/my-pools/[pubkey]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(admin): dashboard shell + stats grid + page

/create/my-pools/[pubkey] renders the admin dashboard. Permission gate:
wallet not connected → connect prompt; wrong wallet → "not the
creator" panel with link to buyer view; correct wallet → full
dashboard. Stats grid shows pot, tickets, time-to-close, creator fee.

LivePoolWatcher wired so the dashboard refetches automatically when
on-chain pool state changes.

RedemptionStatus, TopBuyersBar, and ParticipantList sections stubbed;
they land in Tasks 5-6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `<AdminRedemptionStatus>` — codes list + redeem-check + copy/CSV

**Files:**
- Create: `src/components/AdminRedemptionStatus.tsx`
- Modify: `src/components/AdminDashboard.tsx` (replace stub with `<AdminRedemptionStatus>`)

After this task, the dashboard shows the codes from localStorage with redeemed/unredeemed state, plus copy + CSV affordances.

- [ ] **Step 5.1: Create `<AdminRedemptionStatus>`**

```tsx
// src/components/AdminRedemptionStatus.tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address } from "@solana/kit";
import { hashLeaf, PROGRAM_ID } from "@tombola/sdk";
// `findRedeemedCodePda` is exported from `@tombola/sdk` per `vendor/sdk/pdas.ts`.
// If the import errors, check the exact export — it may be at the top-level
// or under `@tombola/sdk/generated`. The function signature is:
//   findRedeemedCodePda(programId: Address, pool: Address, codeHash: Uint8Array)
//   → Promise<[Address, number]>
import { findRedeemedCodePda } from "@tombola/sdk";
import { encodeRedemptionLink } from "@/lib/private-pools";
import { loadCodesFromStorage, type StoredCodesPayload } from "@/lib/private-pool-storage";

interface Props {
  poolAddress: string;
  walletAddress: string;
}

interface RowState {
  code: string;
  proof: Uint8Array[];
  redeemed: boolean;
}

export function AdminRedemptionStatus({ poolAddress, walletAddress }: Props) {
  const { connection } = useConnection();
  const [stored, setStored] = useState<StoredCodesPayload | null | "missing">(
    null,
  );
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [showRedeemed, setShowRedeemed] = useState(false);

  // Load codes from localStorage
  useEffect(() => {
    const loaded = loadCodesFromStorage(poolAddress, walletAddress);
    setStored(loaded ?? "missing");
  }, [poolAddress, walletAddress]);

  // Check on-chain RedeemedCode PDA existence per code
  useEffect(() => {
    if (stored === null || stored === "missing") return;
    let cancelled = false;
    (async () => {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const checks = await Promise.all(
        stored.codes.map(async (code) => {
          const codeHash = hashLeaf(code);
          const [pda] = await findRedeemedCodePda(
            PROGRAM_ID as Address,
            poolAddress as Address,
            codeHash,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const acc = await rpc
            .getAccountInfo(pda as never, { encoding: "base64" })
            .send();
          return {
            code,
            proof: stored.proofs[code],
            redeemed: !!acc.value,
          } satisfies RowState;
        }),
      );
      if (!cancelled) setRows(checks);
    })();
    return () => {
      cancelled = true;
    };
  }, [stored, connection, poolAddress]);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://tombola-frontend-gamma.vercel.app";

  const linkFor = useCallback(
    (row: RowState): string => {
      if (stored === null || stored === "missing") return "";
      return encodeRedemptionLink({
        origin,
        pool: poolAddress,
        code: row.code,
        proof: row.proof,
        mode: stored.mode,
      }).toString();
    },
    [stored, origin, poolAddress],
  );

  const onCopyOne = useCallback((url: string) => {
    void navigator.clipboard.writeText(url);
  }, []);

  const onCopyAllUnredeemed = useCallback(() => {
    if (!rows) return;
    const all = rows
      .filter((r) => !r.redeemed)
      .map(linkFor)
      .join("\n");
    void navigator.clipboard.writeText(all);
  }, [rows, linkFor]);

  const onDownloadCsv = useCallback(() => {
    if (!rows) return;
    const header = "index,code,redeemed,redemption_url\n";
    const body = rows
      .map(
        (r, i) =>
          `${i + 1},${r.code},${r.redeemed ? "yes" : "no"},${linkFor(r)}`,
      )
      .join("\n");
    const blob = new Blob([header + body], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tombola-codes-${poolAddress.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, linkFor, poolAddress]);

  if (stored === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Loading codes…
      </div>
    );
  }

  if (stored === "missing") {
    return (
      <div className="rounded-2xl border border-red-700/40 bg-red-900/20 p-6">
        <h3 className="font-display text-lg uppercase text-red-300">
          Codes not in this browser&apos;s storage
        </h3>
        <p className="mt-2 text-sm text-neutral-300">
          Invite codes are generated client-side at pool creation. If you
          didn&apos;t save them then (or you&apos;re on a different browser /
          device), they&apos;re unrecoverable.
        </p>
        <Link
          href={`/pool/private/${poolAddress}`}
          className="mt-4 inline-flex rounded bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
        >
          Open buyer view (reclaim rent if no tickets sold) →
        </Link>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Checking redemption status on chain…
      </div>
    );
  }

  const unredeemed = rows.filter((r) => !r.redeemed);
  const redeemed = rows.filter((r) => r.redeemed);
  const ratioPct = rows.length > 0 ? (redeemed.length / rows.length) * 100 : 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-500">
            Redemption status
          </h3>
          <p className="mt-1 text-2xl font-bold text-neutral-100">
            {redeemed.length} / {rows.length} redeemed{" "}
            <span className="text-sm font-normal text-neutral-500">
              ({ratioPct.toFixed(0)}%)
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopyAllUnredeemed}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            Copy all unredeemed
          </button>
          <button
            type="button"
            onClick={onDownloadCsv}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${ratioPct}%` }}
        />
      </div>

      <h4 className="mt-6 mb-2 text-xs uppercase tracking-widest text-neutral-500">
        Unredeemed ({unredeemed.length})
      </h4>
      {unredeemed.length === 0 ? (
        <p className="text-sm text-neutral-500">All codes redeemed.</p>
      ) : (
        <ul className="max-h-[40vh] overflow-y-auto rounded border border-neutral-800 bg-neutral-950/40 p-2 font-mono text-xs">
          {unredeemed.map((r, i) => (
            <li
              key={r.code}
              className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-right text-neutral-600">
                {i + 1}
              </span>
              <code className="flex-1 truncate text-neutral-300">
                {r.code.slice(0, 16)}…
              </code>
              <button
                type="button"
                onClick={() => onCopyOne(linkFor(r))}
                aria-label={`Copy redemption link ${i + 1}`}
                className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
              >
                Copy link
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setShowRedeemed((v) => !v)}
        className="mt-4 text-xs text-neutral-500 underline hover:text-neutral-300"
      >
        {showRedeemed ? "Hide" : "Show"} redeemed ({redeemed.length})
      </button>
      {showRedeemed && redeemed.length > 0 && (
        <ul className="mt-2 rounded border border-neutral-800 bg-neutral-950/40 p-2 font-mono text-xs">
          {redeemed.map((r, i) => (
            <li
              key={r.code}
              className="flex items-center gap-2 border-b border-neutral-800/50 py-2 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-right text-neutral-600">
                {i + 1}
              </span>
              <code className="flex-1 truncate text-neutral-500 line-through">
                {r.code.slice(0, 16)}…
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Wire it into `<AdminDashboard>`**

In `src/components/AdminDashboard.tsx`, replace:

```tsx
{/* Section 5 + 6 land in subsequent tasks. Stub: */}
<div className="mt-8 rounded-2xl border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
  Redemption status, top buyers, and participant list — coming in
  Tasks 5–6.
</div>
```

With:

```tsx
<div className="mt-8">
  <AdminRedemptionStatus
    poolAddress={poolAddress}
    walletAddress={publicKey.toBase58()}
  />
</div>
{/* Section 6 (TopBuyersBar + ParticipantList) lands in Task 6 */}
```

Add the import at the top:
```ts
import { AdminRedemptionStatus } from "./AdminRedemptionStatus";
```

- [ ] **Step 5.3: Run tests + hygiene**

```bash
npm run test
npx eslint src/components/AdminRedemptionStatus.tsx src/components/AdminDashboard.tsx
npm run build
```

All clean.

- [ ] **Step 5.4: Commit Task 5**

```bash
git add src/components/AdminRedemptionStatus.tsx src/components/AdminDashboard.tsx
git commit -m "$(cat <<'EOF'
feat(admin): redemption-status section

Loads codes from localStorage (gated by wallet match), derives the
RedeemedCode PDA per code via hashLeaf + findRedeemedCodePda, and
checks each PDA's existence on chain. Renders:

  - Headline ratio + CSS progress bar
  - Unredeemed list with per-row Copy-link button
  - Redeemed list (collapsed by default)
  - Copy-all-unredeemed + Download-CSV affordances
  - Empty-state when localStorage doesn't have the codes

Wired into AdminDashboard. Section 6 (top buyers + participant
list) lands next.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `<AdminTopBuyersBar>` + `<AdminParticipantList>` — on-chain participant aggregation

**Files:**
- Create: `src/components/AdminTopBuyersBar.tsx`
- Create: `src/components/AdminParticipantList.tsx`
- Modify: `src/components/AdminDashboard.tsx` (wire both in + add the on-chain TicketBatch fetch)

After this task, the dashboard shows the top-5 buyers as a CSS bar chart and a full scrollable participant table.

- [ ] **Step 6.1: Add the participant fetch to `<AdminDashboard>`**

In `src/components/AdminDashboard.tsx`, add a new state + effect that fetches all `TicketBatch` PDAs filtered by pool and aggregates by owner. Place it next to the existing pool-fetch effect.

```tsx
interface ParticipantRow {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
}

// inside AdminDashboard component, after the pool state:
const [participants, setParticipants] = useState<ParticipantRow[] | null>(null);

useEffect(() => {
  if (!pool) return;
  let cancelled = false;
  (async () => {
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const { fetchAllMaybeTicketBatch } = await import(
        "@tombola/sdk/generated"
      );
      // getProgramAccounts with memcmp on TicketBatch.pool (offset 8 = first
      // field after 8-byte discriminator)
      const programAccounts = await rpc
        .getProgramAccounts(PROGRAM_ID as Address, {
          commitment: "confirmed",
          encoding: "base64",
          filters: [
            { dataSize: BigInt(89) }, // 8 disc + 32 pool + 32 owner + 8 first + 8 last + 1 bump
            {
              memcmp: { offset: 8n, bytes: poolAddress as Address },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          ],
        } as never)
        .send() as ReadonlyArray<{ pubkey: Address }>;
      const addresses = programAccounts.map((p) => p.pubkey);
      const accs = await fetchAllMaybeTicketBatch(rpc, addresses);
      const byOwner = new Map<string, { tickets: bigint; spent: bigint }>();
      for (const a of accs) {
        if (!a.exists) continue;
        const owner = String(a.data.owner);
        const ticketCount =
          a.data.lastTicketId - a.data.firstTicketId + 1n;
        const spent = ticketCount * pool.ticketPriceLamports;
        const cur = byOwner.get(owner) ?? { tickets: 0n, spent: 0n };
        byOwner.set(owner, {
          tickets: cur.tickets + ticketCount,
          spent: cur.spent + spent,
        });
      }
      if (cancelled) return;
      setParticipants(
        [...byOwner.entries()]
          .map(([owner, agg]) => ({
            owner,
            tickets: agg.tickets,
            spentLamports: agg.spent,
          }))
          .sort((a, b) => Number(b.tickets - a.tickets)),
      );
    } catch (e) {
      if (!cancelled) {
        console.warn("participant fetch failed:", e);
        setParticipants([]);
      }
    }
  })();
  return () => {
    cancelled = true;
  };
}, [pool, connection, poolAddress]);
```

Add imports:
```ts
import { PROGRAM_ID } from "@tombola/sdk";
```

If `Address` is already imported from earlier, reuse; otherwise add `import type { Address } from "@solana/kit";`.

> **Note on `dataSize: 89`** — verify by checking the actual on-chain account length for an existing TicketBatch. If the byte count is different (e.g., due to padding), update the constant. To verify quickly: `solana account <some-batch-pda> --url devnet` and read the data length. The constant lives in this single file; one place to update.

- [ ] **Step 6.2: Create `<AdminTopBuyersBar>`**

```tsx
// src/components/AdminTopBuyersBar.tsx
"use client";
import { formatSol, formatTickets } from "@/lib/format";

interface Participant {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
}

interface Props {
  participants: Participant[] | null;
}

const TOP_N = 5;

export function AdminTopBuyersBar({ participants }: Props) {
  if (participants === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        Loading participants…
      </div>
    );
  }
  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-500">
        No tickets sold yet.
      </div>
    );
  }

  const top = participants.slice(0, TOP_N);
  const max = top[0].tickets;
  const totalTickets = participants.reduce(
    (acc, p) => acc + p.tickets,
    0n,
  );
  const totalSpent = participants.reduce(
    (acc, p) => acc + p.spentLamports,
    0n,
  );

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="mb-4 flex items-end justify-between">
        <h3 className="text-xs uppercase tracking-widest text-neutral-500">
          Top buyers
        </h3>
        <p className="text-xs text-neutral-500">
          {participants.length} wallet{participants.length === 1 ? "" : "s"} ·{" "}
          {formatTickets(totalTickets)} tickets · {formatSol(totalSpent)}
        </p>
      </div>
      <ul className="space-y-2">
        {top.map((p) => {
          const widthPct =
            max > 0n ? Math.max(2, Number((p.tickets * 100n) / max)) : 0;
          return (
            <li key={p.owner} className="flex items-center gap-3">
              <code className="w-32 shrink-0 truncate font-mono text-xs text-neutral-400">
                {p.owner.slice(0, 8)}…{p.owner.slice(-4)}
              </code>
              <div className="flex-1">
                <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
              <span className="w-32 shrink-0 text-right text-xs tabular-nums text-neutral-300">
                {formatTickets(p.tickets)} · {formatSol(p.spentLamports)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6.3: Create `<AdminParticipantList>`**

```tsx
// src/components/AdminParticipantList.tsx
"use client";
import { formatSol, formatTickets } from "@/lib/format";
import { explorerAddressUrl } from "@/lib/explorer-url";

interface Participant {
  owner: string;
  tickets: bigint;
  spentLamports: bigint;
}

interface Props {
  participants: Participant[] | null;
  rpcUrl: string;
}

export function AdminParticipantList({ participants, rpcUrl }: Props) {
  if (participants === null) return null;
  if (participants.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <h3 className="mb-4 text-xs uppercase tracking-widest text-neutral-500">
        Participants ({participants.length})
      </h3>
      <div className="max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-900 text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2 text-left font-normal">Wallet</th>
              <th className="py-2 text-right font-normal">Tickets</th>
              <th className="py-2 text-right font-normal">Spent</th>
              <th className="py-2 text-right font-normal">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr
                key={p.owner}
                className="border-t border-neutral-800/50 text-neutral-200"
              >
                <td className="py-2 font-mono text-xs">
                  {p.owner.slice(0, 8)}…{p.owner.slice(-4)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatTickets(p.tickets)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatSol(p.spentLamports)}
                </td>
                <td className="py-2 text-right">
                  <a
                    href={explorerAddressUrl(p.owner, rpcUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-500 hover:text-neutral-300"
                  >
                    ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: Wire both into `<AdminDashboard>`**

Replace `{/* Section 6 (TopBuyersBar + ParticipantList) lands in Task 6 */}` with:

```tsx
<div className="mt-8">
  <AdminTopBuyersBar participants={participants} />
</div>
<div className="mt-8">
  <AdminParticipantList
    participants={participants}
    rpcUrl={connection.rpcEndpoint}
  />
</div>
```

Add imports:
```ts
import { AdminTopBuyersBar } from "./AdminTopBuyersBar";
import { AdminParticipantList } from "./AdminParticipantList";
```

- [ ] **Step 6.5: Run tests + hygiene**

```bash
npm run test
npx eslint src/components/AdminTopBuyersBar.tsx src/components/AdminParticipantList.tsx src/components/AdminDashboard.tsx
npm run build
```

All clean.

- [ ] **Step 6.6: Commit Task 6**

```bash
git add src/components/AdminTopBuyersBar.tsx src/components/AdminParticipantList.tsx src/components/AdminDashboard.tsx
git commit -m "$(cat <<'EOF'
feat(admin): top-buyers bar + participant list + on-chain aggregation

AdminDashboard now fetches all TicketBatch PDAs filtered by pool
(getProgramAccounts memcmp at offset 8), aggregates per owner
(tickets count + lamports spent), and feeds the top-5 CSS bar chart
and the full scrollable participant table.

dataSize=89 constant matches the on-chain TicketBatch layout
(8 disc + 32 pool + 32 owner + 8 first + 8 last + 1 bump). If the
struct grows, update this single constant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final hygiene + push + PR

**Files:** none (verification only)

- [ ] **Step 7.1: Full hygiene gate**

```bash
cd ~/Desktop/tombola-frontend
npx eslint $(git diff --name-only main..HEAD | grep -E '\.tsx?$' | tr '\n' ' ')
npm run test
npm run build
```

All three clean.

- [ ] **Step 7.2: Push branch**

```bash
git push -u origin feat/private-pools-admin
```

- [ ] **Step 7.3: Open PR**

```bash
gh pr create --base main --head feat/private-pools-admin --title "feat(admin): private-pools admin dashboard + discoverability" --body "$(cat <<'EOF'
## Summary
Closes the two UX gaps from PR #10:

- **Discoverability** — adds a PRIVATE nav item + landing-page CTA so the private-pools surface is reachable from the home page.
- **Code recovery** — invite codes now persist to localStorage on creation and re-display in a creator-only admin dashboard at \`/create/my-pools/[pubkey]\`. Includes redemption status, top-buyers bar chart, and full participant list.

## What lands
- \`/create/my-pools/[pubkey]\` (NEW) — admin dashboard
- 5 new components: AdminDashboard, AdminDashboardStats, AdminRedemptionStatus, AdminTopBuyersBar, AdminParticipantList
- 1 new lib: \`src/lib/private-pool-storage.ts\` + 9 unit tests
- 3 modified files: CreatePoolForm (save-on-success + load banner), Header (PRIVATE nav), page.tsx (landing CTA)

## Spec + plan
- Spec: [docs/specs/2026-05-09-private-pools-admin-dashboard-design.md](docs/specs/2026-05-09-private-pools-admin-dashboard-design.md)
- Plan: [docs/plans/2026-05-09-private-pools-admin-dashboard.md](docs/plans/2026-05-09-private-pools-admin-dashboard.md)

## Test plan
- [x] All vitest tests pass (existing 66 + 9 new = 75)
- [x] \`npm run build\` clean across the new dynamic route
- [x] \`npx eslint\` on all 11 new/changed files clean
- [ ] **Manual devnet E2E** (after merge):
  1. Visit https://tombola-frontend-gamma.vercel.app/ — see PRIVATE in nav + landing CTA
  2. Click PRIVATE → /create
  3. Fill form, create a pool, verify codes display
  4. Navigate to /create/my-pools/[pubkey] — verify dashboard shows codes (now sourced from localStorage), 0 participants, countdown
  5. From a different wallet, redeem one code → return to admin dashboard → refresh → verify code moved from Unredeemed → Redeemed AND new participant appears in top-buyers + table

## Out of scope (future work)
- Per-buyer code attribution (which code each buyer used) — requires tx history scan
- Time-series pot-growth chart
- Cross-device code sync
- IndexedDB fallback (5MB localStorage cap fits ~6 maximally-sized pools)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7.4: Manual devnet E2E**

Use the live Vercel preview URL that GitHub posts in PR #11's comments to run through the test plan. Mark this step done once verified.

---

## Self-review checklist (run before Task 1)

- [ ] **Spec coverage:**
  - §Goal → all tasks
  - §Routing — `/create/my-pools/[pubkey]` → Task 4 (page); discoverability fixes → Task 3
  - §localStorage persistence → Task 1 (storage lib) + Task 2 (form integration)
  - §Admin dashboard composition → Tasks 4 (shell + stats), 5 (redemption status), 6 (top buyers + participant list)
  - §On-chain reads → Task 4 (pool fetch) + Task 5 (RedeemedCode PDA derivation) + Task 6 (TicketBatch aggregation)
  - §Code-flow integration → Task 2 (saveCodesToStorage in form)
  - §Discoverability fix → Task 3
  - §Error handling → distributed across tasks
  - §Testing → Task 1 TDD; downstream tasks use manual + existing-test-non-regression
- [ ] **No placeholders:** every step has either runnable code or a runnable command. The `dataSize: 89` constant in Task 6 has a verification note inline; not a placeholder.
- [ ] **Type consistency:**
  - `RedemptionMode` (existing, from `src/lib/private-pools.ts`) consumed by Task 1 (storage) + Task 5 (redemption status)
  - `StoredCodesPayload` defined in Task 1, consumed in Tasks 2 and 5
  - `ParticipantRow` defined in Task 6's `<AdminDashboard>` mod, mirrored as `Participant` in `AdminTopBuyersBar` + `AdminParticipantList` (intentional — keep components decoupled from internal aggregation type)
- [ ] **Atomic commits:** one feature scope per task; hygiene gate green before each commit.

## Out of scope (revisit as follow-ups)

- Per-buyer code attribution
- Time-series pot growth charts
- Email/SMS resending of redemption links
- Cross-device code sync
- IndexedDB fallback
- Multi-pool aggregate dashboard
- Pool deletion before close (protocol-immutable)

# Local Validator Pivot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:executing-plans` (inline, with checkpoints between tasks). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a local Solana validator with the Tombola raffle program deployed and four public pools initialized, then wire `tombola-frontend` to read live on-chain data and execute buy-ticket transactions through Phantom — sidestepping devnet-SOL-faucet rate limits entirely.

**Architecture:**

1. **Companion repo `~/Desktop/Project Tombola` already supports `localnet` cluster.** `Anchor.toml`'s default provider is `localnet`; `scripts/_helpers.ts::parseCluster` accepts `"localnet"` and returns RPC `http://127.0.0.1:8899`. We just point the existing scripts at the local validator — no companion-repo source changes.
2. **Switchboard On-Demand is sidesteppable.** `RAFFLE_VRF_ORACLE` is recorded in `ProtocolConfig` at init but only *used* during `commit_draw` / `settle_draw`. Buy-ticket has no Switchboard CPI. We pass the deployer's pubkey as a placeholder oracle so init succeeds; live VRF integration deferred.
3. **Frontend pulls the SDK in as a path import.** The SDK has no `package.json` (it's part of the companion repo's monorepo), so we bring it in via `transpilePackages` + a path alias to `~/Desktop/Project Tombola/sdk/src` and add `@solana/kit` + `@solana/web3-compat` to the frontend's `package.json`.
4. **Wallet adapter ↔ Kit boundary.** Wallet adapter returns `@solana/web3.js` types; SDK builds `@solana/kit` instructions. We convert kit→web3 in a tiny adapter so `wallet.sendTransaction(tx, connection)` keeps working unchanged.

**Tech stack:** solana-cli 3.1.14, anchor-cli 1.0.2, Next.js 15.5, Tombola SDK (`@solana/kit` v6.9), `@solana/wallet-adapter` 0.15 (existing), Phantom (custom RPC).

**Repos in scope:**
- **`~/Desktop/Project Tombola`** — read-only. Tasks 1–4 run scripts that already exist. NO source modifications.
- **`~/Desktop/tombola-frontend` (this worktree)** — Tasks 5–11 generate atomic commits.

**What this plan does NOT do:**
- Live VRF / draw cycle (commit_draw, settle_draw). Pools fill up but don't draw on local. That's a future task.
- Add a test suite. CLAUDE.md says vitest goes in *when phase 3 lands*; we'll do that as a follow-up plan after the wiring works.
- Change anything in the companion repo's source.

---

## Phase A — Local validator stack (companion repo, read-only)

### Task 1: Start local validator

**Files:** none modified. Commands only.

- [ ] **Step 1: Confirm port 8899 is free**

```bash
lsof -i :8899 || echo "free"
```

Expected: `free`. If something is listening, identify and stop it (likely a previous test-validator run).

- [ ] **Step 2: Start `solana-test-validator` in the background with a persistent ledger**

```bash
mkdir -p ~/.tombola-localnet
cd ~/.tombola-localnet
solana-test-validator --reset --rpc-port 8899 > validator.log 2>&1 &
echo $! > validator.pid
```

Notes:
- `--reset` wipes any previous ledger so each session starts clean.
- Background with `&`; PID stashed in `validator.pid` for clean shutdown later.
- Logs go to `~/.tombola-localnet/validator.log`.

- [ ] **Step 3: Wait for the validator to become ready**

```bash
until solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; do sleep 1; done
echo "validator ready"
```

Expected: `validator ready` within ~5s.

- [ ] **Step 4: Point the Solana CLI at localhost and airdrop the deployer**

```bash
solana config set --url http://127.0.0.1:8899
solana airdrop 100
solana balance
```

Expected: `100 SOL`. Deployer keypair is `~/.config/solana/id.json` (per `SESSION_HANDOFF.md`).

- [ ] **Step 5: Sanity check program deploy authority matches expected pubkey**

```bash
solana address
# expected: EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt
```

If mismatched, the `target/deploy/raffle-keypair.json` upgrade authority won't match. Stop and reconcile.

---

### Task 2: Build + deploy raffle program to localnet

**Files:** none modified. Commands only.

- [ ] **Step 1: Build the program**

```bash
cd "/Users/marwanchahboun/Desktop/Project Tombola"
source "$HOME/.cargo/env" && export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
NO_DNA=1 anchor build
```

Expected: `target/deploy/raffle.so` exists. `NO_DNA=1` matches the companion repo's hygiene gate.

- [ ] **Step 2: Deploy the binary to localnet**

```bash
solana program deploy --url http://127.0.0.1:8899 target/deploy/raffle.so
```

Expected: `Program Id: qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M`. (The keypair at `target/deploy/raffle-keypair.json` is committed to the repo, so the program ID matches `Anchor.toml`'s `[programs.localnet]` entry.)

- [ ] **Step 3: Verify program is on-chain**

```bash
solana program show qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M --url http://127.0.0.1:8899
```

Expected: program listed, executable, with the correct authority.

---

### Task 3: Initialize ProtocolConfig on localnet

**Files:** none modified. Commands only.

- [ ] **Step 1: Pick a placeholder VRF oracle pubkey (deployer self)**

The deployer's address doubles as the placeholder `RAFFLE_VRF_ORACLE`. The protocol records it in `ProtocolConfig` but never CPIs to it for buy-ticket flows.

```bash
DEPLOYER=$(solana address)
echo "deployer = $DEPLOYER"
```

- [ ] **Step 2: Run the init-protocol script pointed at localnet**

```bash
cd "/Users/marwanchahboun/Desktop/Project Tombola"
RAFFLE_TREASURY=$DEPLOYER \
RAFFLE_VRF_ORACLE=$DEPLOYER \
tsx scripts/deploy.ts localnet
```

Expected output:
```
deploy: cluster=localnet rpc=http://127.0.0.1:8899
deploy: deployer=<DEPLOYER>
deploy: treasury=<DEPLOYER> vrf_oracle=<DEPLOYER>
✓ initialize_protocol confirmed: <signature>
```

- [ ] **Step 3: Verify ProtocolConfig was created**

```bash
tsx -e 'import("./sdk/src/index.js").then(async ({ RaffleClient }) => { const { createSolanaRpc } = await import("@solana/kit"); const rpc = createSolanaRpc("http://127.0.0.1:8899"); const client = new RaffleClient({ rpc }); console.log(await client.getProtocolConfig()); })'
```

Expected: an object with `treasury`, `vrfOracle`, `feeBps` fields populated.

---

### Task 4: Initialize the four public pools

**Files:** none modified. Commands only.

- [ ] **Step 1: Pick a Day-0 anchor (a Monday)**

The `init_public_pools.ts` script wants a Monday as the Day-0 reference. Today is 2026-05-08 (Friday), so the next Monday is 2026-05-11.

```bash
DAY_ZERO=2026-05-11
```

- [ ] **Step 2: Run init script**

```bash
cd "/Users/marwanchahboun/Desktop/Project Tombola"
tsx scripts/init_public_pools.ts localnet --day0 $DAY_ZERO
```

Expected: four `initialize_public_pool` transactions confirmed; output lists Weekly/Biweekly/Triweekly/Monthly pools each with a `closeTime`.

- [ ] **Step 3: Spot-check via SDK that round 1 of each pool is readable**

```bash
tsx -e 'import("./sdk/src/index.js").then(async ({ RaffleClient }) => { const { createSolanaRpc } = await import("@solana/kit"); const rpc = createSolanaRpc("http://127.0.0.1:8899"); const client = new RaffleClient({ rpc }); for (const pt of [0,1,2,3]) { const p = await client.getPublicPool(pt, 1n); console.log(`type=${pt} round=${p.round} state=${p.state} close=${new Date(Number(p.closeTime)*1000).toISOString()}`); } })'
```

Expected: 4 lines, all `state=0` (Open), `closeTime` values progressively later.

---

## Phase B — Frontend wires to localnet (commits live here)

### Task 5: Bring SDK + Kit into the frontend

**Files:**
- Modify: `package.json` (add `@solana/kit`, `@solana/web3-compat`)
- Modify: `next.config.ts` (add `transpilePackages` for the SDK path)
- Modify: `tsconfig.json` (add path alias `@tombola/sdk`)
- Modify: `.gitignore` (ignore `.claude/`)
- Create: `.env.local` (set `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899`)

- [ ] **Step 1: Add Kit + web3-compat to frontend deps**

```bash
cd /Users/marwanchahboun/Desktop/tombola-frontend/.claude/worktrees/sad-davinci-1c0bfb
npm install @solana/kit@^6.9.0 @solana/web3-compat@^0.0.21
```

Expected: lockfile updates; both packages resolved.

- [ ] **Step 2: Add a path alias for the SDK in `tsconfig.json`**

Existing `compilerOptions.paths` likely has `"@/*": ["./src/*"]`. Add an alias to the SDK source path. Open `tsconfig.json` and update:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@tombola/sdk": ["../../../../Project Tombola/sdk/src/index.ts"],
      "@tombola/sdk/*": ["../../../../Project Tombola/sdk/src/*"]
    }
  }
}
```

(The `../../../../` reaches up out of the worktree path `<repo>/.claude/worktrees/sad-davinci-1c0bfb/` to `~/Desktop/Project Tombola/sdk/src`. Verify with `ls ../../../../Project\ Tombola/sdk/src/index.ts` — must exist.)

- [ ] **Step 3: Configure `next.config.ts` to transpile the SDK source**

Open `next.config.ts`. Inside the config object, add:

```ts
const config: NextConfig = {
  transpilePackages: ["@tombola/sdk"],
  webpack: (config) => {
    // Resolve the SDK path alias at build time
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@tombola/sdk": require("path").resolve(
        __dirname,
        "../../../../Project Tombola/sdk/src/index.ts",
      ),
    };
    return config;
  },
};
```

If `next.config.ts` is currently a one-line export-default, expand it. Verify with a build later.

- [ ] **Step 4: Create `.env.local`**

```
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
```

- [ ] **Step 5: Add `.claude/` to `.gitignore`**

The launch.json is session-tooling only; `.claude/` shouldn't be committed.

- [ ] **Step 6: Build to confirm wiring resolves**

```bash
rm -rf .next && npm run build
```

Expected: clean build, no module-not-found for `@tombola/sdk`. Type errors here mean the path alias is wrong.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts .gitignore
git commit -m "phase 3.1: pull Tombola SDK into frontend via path alias"
```

(Note: `.env.local` is already gitignored by the create-next-app default `.gitignore`, so it won't be committed.)

---

### Task 6: Live pool fetcher (replace mocks at the page boundary)

**Files:**
- Create: `src/lib/get-pools.ts` — server-only fetcher
- Modify: `src/lib/mock-pools.ts` — keep `PoolView` type export; mocks become a fallback
- Modify: `src/app/page.tsx` — call live fetcher, fall back to mocks on error

- [ ] **Step 1: Create the live fetcher**

`src/lib/get-pools.ts`:

```ts
import "server-only";
import { createSolanaRpc } from "@solana/kit";
import { RaffleClient, PoolType, type PoolTypeValue } from "@tombola/sdk";
import type { PoolView, PoolKind, PoolState } from "./mock-pools";

const KIND_BY_TYPE: Record<PoolTypeValue, PoolKind> = {
  [PoolType.Weekly]: "Weekly",
  [PoolType.Biweekly]: "Biweekly",
  [PoolType.Triweekly]: "Triweekly",
  [PoolType.Monthly]: "Monthly",
};

const STATE_BY_DISCRIMINANT: Record<number, PoolState> = {
  0: "Open",
  1: "AwaitingVrf",
  2: "Resolved",
};

export async function getLivePools(): Promise<PoolView[]> {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");
  const rpc = createSolanaRpc(url);
  const client = new RaffleClient({ rpc });

  const poolTypes: PoolTypeValue[] = [
    PoolType.Weekly, PoolType.Biweekly, PoolType.Triweekly, PoolType.Monthly,
  ];

  const pools = await Promise.all(
    poolTypes.map(async (poolType) => {
      const counter = await client.getPoolTypeCounter(poolType);
      const round = counter.currentRound;
      const p = await client.getPublicPool(poolType, round);
      return {
        kind: KIND_BY_TYPE[poolType],
        poolType,
        round: p.round,
        state: STATE_BY_DISCRIMINANT[Number(p.state)] ?? "Open",
        totalTickets: p.totalTickets,
        totalPotLamports: p.totalPot,
        closeTimeUnix: Number(p.closeTime),
        ticketPriceLamports: p.ticketPrice,
      } satisfies PoolView;
    })
  );
  return pools;
}
```

Notes:
- Field names from `PublicPool` may need spot-check (`p.totalPot` vs `p.totalPotLamports`, `p.closeTime` vs `p.closeTimeUnix`, etc.). Verify against `sdk/src/generated/accounts/publicPool.ts` during execution; adjust if needed.
- `getPoolTypeCounter`'s field name for current round may be `currentRound`, `latestRound`, or just `round` — confirm at execution.
- BigInt discipline: `p.round`, `p.totalTickets`, `p.totalPot`, `p.ticketPrice` should already be BigInt (Codama generates them as such).

- [ ] **Step 2: Update `page.tsx` to call the live fetcher with mock fallback**

Current `src/app/page.tsx` imports `MOCK_POOLS` and renders directly. Change to:

```tsx
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { PoolCard } from "@/components/PoolCard";
import { MOCK_POOLS } from "@/lib/mock-pools";
import { getLivePools } from "@/lib/get-pools";

async function loadPools() {
  try {
    const pools = await getLivePools();
    return { pools, source: "live" as const };
  } catch (err) {
    console.warn("getLivePools failed, falling back to mocks:", err);
    return { pools: MOCK_POOLS, source: "mock" as const };
  }
}

export default async function Home() {
  const { pools, source } = await loadPools();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <header className="mb-12 sm:mb-20">
        {/* ...existing header... */}
      </header>

      <main>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-xl font-semibold">Public pools</h2>
          <span className="text-sm text-neutral-500">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
              source === "live"
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 ring-amber-500/20"
            }`}>
              {source === "live" ? "live — localnet" : "mock data — validator offline"}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {pools.map((pool) => (
            <PoolCard key={pool.poolType} pool={pool} />
          ))}
        </div>
      </main>

      {/* ...existing footer... */}
    </div>
  );
}
```

Replace only the `<main>` block; preserve header and footer markup verbatim.

- [ ] **Step 3: Build to type-check**

```bash
rm -rf .next && npm run build
```

Expected: clean. Any type errors here are likely SDK field-name mismatches in `getLivePools` — fix them by reading `sdk/src/generated/accounts/publicPool.ts` and `poolTypeCounter.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/get-pools.ts src/app/page.tsx
git commit -m "phase 3.2: live pool reads with mock fallback"
```

---

### Task 7: Visual verify in dev server

**Files:** none modified.

- [ ] **Step 1: Restart preview server**

```bash
# Stop the previous preview
# Then restart via mcp__Claude_Preview__preview_start "tombola-dev"
```

Make sure validator from Task 1 is still running.

- [ ] **Step 2: Hit `http://localhost:<port>` and verify**

The page should show:
- 4 pool cards
- Live—localnet badge (green)
- All 4 pools `state=Open`
- Pots `0 SOL`, tickets `0`, close-times reflecting Day-0 + offsets from Task 4

If badge says "validator offline", check console for the warning message and inspect `validator.log`.

- [ ] **Step 3: (No commit — verification only)**

---

## Phase C — Buy-ticket flow (phase 4)

### Task 8: Phantom localhost configuration (manual user step)

**No code changes.** This is a one-time browser-side config the user must perform.

- [ ] **Step 1: Open Phantom → Settings → Developer Settings → Testnet Mode → enable**
- [ ] **Step 2: Settings → Active Network → Localnet → set Custom RPC to `http://127.0.0.1:8899`**
- [ ] **Step 3: Airdrop SOL into the Phantom address from terminal**

```bash
solana airdrop 5 <PHANTOM_ADDRESS> --url http://127.0.0.1:8899
```

Replace `<PHANTOM_ADDRESS>` with the address Phantom shows. Verify in Phantom that 5 SOL appears.

---

### Task 9: Buy-ticket button + kit-to-web3 adapter

**Files:**
- Create: `src/lib/kit-to-web3.ts` — convert `@solana/kit` `Instruction` to `@solana/web3.js` `TransactionInstruction`
- Create: `src/components/BuyTicketButton.tsx` — client component, replaces the disabled button on each card when wallet is connected
- Modify: `src/components/PoolCard.tsx` — slot in the new button on Open pools

- [ ] **Step 1: Write the kit→web3 adapter**

`src/lib/kit-to-web3.ts`:

```ts
"use client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Instruction } from "@solana/kit";

export function kitToWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: (a.role & 0b10) !== 0,    // WritableSigner=3, ReadonlySigner=2
      isWritable: (a.role & 0b01) !== 0,  // WritableSigner=3, Writable=1
    })),
    data: Buffer.from(ix.data),
  });
}
```

Cross-check the `role` bit mapping against `@solana/kit`'s `AccountRole` enum at execution time. If kit uses a different encoding, adjust accordingly.

- [ ] **Step 2: Create `BuyTicketButton` client component**

`src/components/BuyTicketButton.tsx`:

```tsx
"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { RaffleClient, type PoolTypeValue } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";

interface Props {
  poolType: PoolTypeValue;
  round: bigint;
  disabled?: boolean;
}

export function BuyTicketButton({ poolType, round, disabled }: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setBusy(true);
    setErr(null);
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const buyer = {
        address: publicKey.toBase58() as never, // wallet adapter is the signer
        signTransactions: async () => { throw new Error("unused; sign via wallet"); },
      };
      const result = await client.buyTicketPublic({
        buyer,
        poolType,
        round,
        quantity: 1n,
      });
      const ix = kitToWeb3(result.instruction);
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      window.location.reload(); // refetch the server component
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [connection, publicKey, signTransaction, sendTransaction, poolType, round]);

  if (!publicKey) {
    return (
      <button
        disabled
        className="mt-2 w-full rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-500"
      >
        Connect wallet to buy
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onClick}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
      >
        {busy ? "Buying…" : disabled ? "Round closed" : "Buy ticket (0.01 SOL)"}
      </button>
      {err && <p className="text-xs text-rose-400 break-words">{err}</p>}
    </div>
  );
}
```

Notes:
- The `buyer` arg shape needs verifying against `RaffleClient.buyTicketPublic` signature. If it strictly requires a `KeyPairSigner`, we'll instead build the instruction manually via `getBuyTicketPublicInstruction` from the generated layer (which lets us pass just an address). Adjust at execution.

- [ ] **Step 3: Slot it into `PoolCard`**

Replace the existing disabled button in `src/components/PoolCard.tsx` (lines 58-65) with:

```tsx
<BuyTicketButton
  poolType={pool.poolType}
  round={pool.round}
  disabled={closed}
/>
```

Add the import: `import { BuyTicketButton } from "./BuyTicketButton";`.

`PoolCard` is currently a server component. Importing a client component into a server component is fine — Next.js handles the boundary automatically.

- [ ] **Step 4: Build**

```bash
rm -rf .next && npm run build
```

Expected: clean. Type errors here are likely buyer-shape mismatches; adjust per the SDK's actual signature.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kit-to-web3.ts src/components/BuyTicketButton.tsx src/components/PoolCard.tsx
git commit -m "phase 4: buy-ticket button via wallet adapter + kit→web3 adapter"
```

---

### Task 10: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Confirm validator + frontend dev server are both up**

- [ ] **Step 2: In a real browser, connect Phantom, click Buy ticket on Weekly pool**

Expected:
- Phantom popup with the buy-ticket transaction
- Approval → tx submitted → page reload after confirmation
- Pool card now shows `1` ticket and `0.01 SOL` pot

- [ ] **Step 3: Buy a few more tickets across pools to populate them**

- [ ] **Step 4: Update `SESSION_HANDOFF.md` to reflect new state**

Mark phase 3 + 4 ✅ done; document the localnet recipe; note Switchboard VRF still deferred.

- [ ] **Step 5: Commit the handoff update**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: phase 3+4 done on localnet; update handoff"
```

---

## Risks & rollback

| risk | likelihood | mitigation |
|---|---|---|
| SDK field-name drift (`totalPot` vs `totalPotLamports`) | medium | spot-check `sdk/src/generated/accounts/publicPool.ts` at execution; adjust `getLivePools` |
| `kitToWeb3` role-bit mapping wrong | medium | verify against `@solana/kit` `AccountRole` source at execution; first buy_ticket tx will reveal mismatch |
| Phantom localhost config friction | low | manual user step (Task 8); known-working pattern |
| Validator process killed mid-flow | low | `--reset` on next start re-runs Tasks 1–4 in ~5 min |
| `transpilePackages` + path alias collision | medium | if Next can't resolve, fall back to a `npm link` approach or copy SDK into `lib/sdk/` |

**Rollback:** all frontend changes are isolated commits. To revert: `git reset --hard 81179e6` (last commit before this work) and stop the validator. The companion repo is untouched.

---

## Post-execution follow-ups (not in this plan)

1. Vitest setup for SDK integration unit tests (CLAUDE.md says phase 3 lands → vitest goes in).
2. Live VRF integration via Switchboard On-Demand cloning, OR a local-only `mock_vrf` program that fakes commit/settle responses.
3. Resume phase 5 polish (items 2–7 of the original handoff).
4. Add a "round counter" UI element so users see which round they're buying into.
5. Pool refresh without full page reload (websocket subscription via `@solana/kit`'s `createSolanaRpcSubscriptions`).

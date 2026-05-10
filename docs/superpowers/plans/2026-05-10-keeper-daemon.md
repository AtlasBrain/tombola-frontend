# Keeper Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js keeper daemon (`beta/keeper/`) that automatically commits and settles private Tombola pools once their `close_time` has elapsed.

**Architecture:** Stateless 30-second poll loop. Each tick uses `getProgramAccounts` to fetch all PrivatePool accounts, decodes them, classifies each as needing `commit` (state 0 + closed + tickets > 0) or `settle` (state 1 + oracle revealed), and dispatches the action. Uses `@switchboard-xyz/on-demand` for VRF, web3.js for all transaction sending. Deployed on Railway via Nixpacks (no Docker needed).

**Tech Stack:** Node.js 20, TypeScript, `@switchboard-xyz/on-demand ^3.10.1`, `@solana/web3.js ^1.98.4`, `@solana/kit ^6.9.0`, vitest for tests, tsx as runtime.

---

## File Map

```
beta/keeper/
  src/
    wallet.ts     — loadKeeperKeypair(): Keypair (parses KEEPER_KEYPAIR env var)
    logger.ts     — log/logError/logInfo (structured console output)
    tx.ts         — kitIxToWeb3() converter + sendAndConfirm() helper
    scan.ts       — scanActionablePools() → ActionablePool[] via getProgramAccounts
    commit.ts     — commitPool(): Switchboard create + commitDrawPrivate bundle
    settle.ts     — settlePool(): oracle poll + winner compute + settleDrawPrivate
    index.ts      — entry point: env validation + poll loop
  src/__tests__/
    wallet.test.ts
    scan.test.ts
    settle.test.ts
  package.json
  tsconfig.json
  railway.toml
  .gitignore
```

**External imports used throughout:**
- `@tombola/sdk` → mapped via tsconfig paths to `../../vendor/sdk/index.ts`
- `@tombola/sdk/generated/accounts/privatePool` → `../../vendor/sdk/generated/accounts/privatePool.ts`
- `@tombola/sdk/generated/accounts/ticketBatch` → `../../vendor/sdk/generated/accounts/ticketBatch.ts`

---

## Task 1: Project Scaffold

**Files:**
- Create: `beta/keeper/package.json`
- Create: `beta/keeper/tsconfig.json`
- Create: `beta/keeper/railway.toml`
- Create: `beta/keeper/.gitignore`

- [ ] **Step 1: Create `beta/keeper/package.json`**

```json
{
  "name": "@tombola/keeper",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@solana/kit": "^6.9.0",
    "@solana/web3.js": "^1.98.4",
    "@switchboard-xyz/on-demand": "^3.10.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Create `beta/keeper/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@tombola/sdk": ["../../vendor/sdk/index.ts"],
      "@tombola/sdk/*": ["../../vendor/sdk/*"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `beta/keeper/railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
```

- [ ] **Step 4: Create `beta/keeper/.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 5: Install dependencies**

```bash
cd beta/keeper
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add beta/keeper/package.json beta/keeper/tsconfig.json beta/keeper/railway.toml beta/keeper/.gitignore beta/keeper/package-lock.json
git commit -m "chore(keeper): project scaffold"
```

---

## Task 2: wallet.ts

**Files:**
- Create: `beta/keeper/src/wallet.ts`
- Create: `beta/keeper/src/__tests__/wallet.test.ts`

- [ ] **Step 1: Write the failing test**

Create `beta/keeper/src/__tests__/wallet.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadKeeperKeypair } from "../wallet.js";

describe("loadKeeperKeypair", () => {
  const original = process.env.KEEPER_KEYPAIR;

  afterEach(() => {
    if (original === undefined) delete process.env.KEEPER_KEYPAIR;
    else process.env.KEEPER_KEYPAIR = original;
  });

  it("throws when KEEPER_KEYPAIR is not set", () => {
    delete process.env.KEEPER_KEYPAIR;
    expect(() => loadKeeperKeypair()).toThrow("KEEPER_KEYPAIR env var is not set");
  });

  it("throws when KEEPER_KEYPAIR is not valid JSON", () => {
    process.env.KEEPER_KEYPAIR = "not-json";
    expect(() => loadKeeperKeypair()).toThrow("KEEPER_KEYPAIR is not valid JSON");
  });

  it("throws when KEEPER_KEYPAIR is not a 64-element array", () => {
    process.env.KEEPER_KEYPAIR = JSON.stringify([1, 2, 3]);
    expect(() => loadKeeperKeypair()).toThrow("must be a 64-element JSON array");
  });

  it("returns a Keypair when given a valid 64-byte secret key", () => {
    const secretKey = Array.from({ length: 64 }, (_, i) => i % 256);
    process.env.KEEPER_KEYPAIR = JSON.stringify(secretKey);
    const kp = loadKeeperKeypair();
    expect(kp.secretKey).toHaveLength(64);
    expect(kp.publicKey.toBase58()).toBeTypeOf("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd beta/keeper && npm test
```

Expected: FAIL with "Cannot find module '../wallet.js'"

- [ ] **Step 3: Implement `beta/keeper/src/wallet.ts`**

```typescript
import { Keypair } from "@solana/web3.js";

export function loadKeeperKeypair(): Keypair {
  const raw = process.env.KEEPER_KEYPAIR;
  if (!raw) throw new Error("KEEPER_KEYPAIR env var is not set");
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error("KEEPER_KEYPAIR is not valid JSON");
  }
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(
      `KEEPER_KEYPAIR must be a 64-element JSON array, got ${Array.isArray(arr) ? `length ${arr.length}` : "non-array"}`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd beta/keeper && npm test
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add beta/keeper/src/wallet.ts beta/keeper/src/__tests__/wallet.test.ts
git commit -m "feat(keeper): wallet keypair loader"
```

---

## Task 3: logger.ts

**Files:**
- Create: `beta/keeper/src/logger.ts`

No unit test needed — these are pure console wrappers.

- [ ] **Step 1: Create `beta/keeper/src/logger.ts`**

```typescript
function ts(): string {
  return new Date().toISOString();
}

function poolTag(address: string): string {
  return `[${address.slice(0, 8)}…]`;
}

export function log(poolAddress: string, msg: string): void {
  console.log(`${ts()} ${poolTag(poolAddress)} ${msg}`);
}

export function logError(poolAddress: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`${ts()} ${poolTag(poolAddress)} ERROR ${msg}: ${detail}`);
}

export function logInfo(msg: string): void {
  console.log(`${ts()} ${msg}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add beta/keeper/src/logger.ts
git commit -m "feat(keeper): structured logger"
```

---

## Task 4: tx.ts

**Files:**
- Create: `beta/keeper/src/tx.ts`

Converts Kit `Instruction` → web3.js `TransactionInstruction` and wraps `sendAndConfirmTransaction`.

- [ ] **Step 1: Create `beta/keeper/src/tx.ts`**

```typescript
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  PublicKey,
} from "@solana/web3.js";
import type { Instruction } from "@solana/kit";

/**
 * Convert a Kit Instruction to a web3.js TransactionInstruction.
 * AccountRole bit layout: bit 0 = WRITABLE, bit 1 = SIGNER.
 */
export function kitIxToWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: ((a.role as number) & 0b10) !== 0,
      isWritable: ((a.role as number) & 0b01) !== 0,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

/**
 * Build a Transaction from the given instructions and send it with confirmation.
 * `signers[0]` is the fee payer.
 */
export async function sendAndConfirm(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = signers[0].publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  return sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd beta/keeper && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add beta/keeper/src/tx.ts
git commit -m "feat(keeper): tx helpers (kitIxToWeb3, sendAndConfirm)"
```

---

## Task 5: scan.ts

**Files:**
- Create: `beta/keeper/src/scan.ts`
- Create: `beta/keeper/src/__tests__/scan.test.ts`

Fetches all PrivatePool accounts and classifies them as `commit`, `settle`, or `stuck`.

- [ ] **Step 1: Write the failing test**

Create `beta/keeper/src/__tests__/scan.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyPool } from "../scan.js";

// PoolState discriminant values: 0=Open, 1=AwaitingVrf, 2=Resolved
describe("classifyPool", () => {
  const BASE = {
    totalTickets: 10n,
    closeTime: 1_000_000n,
    commitSlot: 0n,
  };
  const now = 2_000_000n; // well past close_time
  const STUCK_THRESHOLD = 3_600n;

  it("returns 'commit' for open pool past close_time with tickets", () => {
    expect(classifyPool({ ...BASE, state: 0 }, now, STUCK_THRESHOLD)).toBe("commit");
  });

  it("returns null for open pool past close_time with zero tickets", () => {
    expect(classifyPool({ ...BASE, state: 0, totalTickets: 0n }, now, STUCK_THRESHOLD)).toBeNull();
  });

  it("returns null for open pool not yet closed", () => {
    expect(classifyPool({ ...BASE, state: 0, closeTime: 9_999_999_999n }, now, STUCK_THRESHOLD)).toBeNull();
  });

  it("returns 'settle' for AwaitingVrf pool within stuck threshold", () => {
    // closeTime = now - 60s, not stuck yet (threshold = 3600s)
    const closeTime = now - 60n;
    expect(classifyPool({ ...BASE, state: 1, closeTime }, now, STUCK_THRESHOLD)).toBe("settle");
  });

  it("returns 'stuck' for AwaitingVrf pool past stuck threshold", () => {
    // closeTime = now - 3700s
    const closeTime = now - 4_000n;
    expect(classifyPool({ ...BASE, state: 1, closeTime }, now, STUCK_THRESHOLD)).toBe("stuck");
  });

  it("returns null for resolved pool", () => {
    expect(classifyPool({ ...BASE, state: 2 }, now, STUCK_THRESHOLD)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd beta/keeper && npm test
```

Expected: FAIL with "Cannot find module '../scan.js'"

- [ ] **Step 3: Implement `beta/keeper/src/scan.ts`**

```typescript
import { type Address, createSolanaRpc } from "@solana/kit";
import { getPrivatePoolDecoder } from "@tombola/sdk/generated/accounts/privatePool";
import type { PrivatePool } from "@tombola/sdk/generated/accounts/privatePool";

export type PoolAction = "commit" | "settle" | "stuck";

export interface ActionablePool {
  address: string;
  pool: PrivatePool;
  action: PoolAction;
}

// PrivatePool on-chain account size. Verified on devnet (8 discriminator + 208 fields).
const PRIVATE_POOL_SIZE = 216n;
// How many seconds after close_time before declaring the oracle stuck.
const STUCK_THRESHOLD_SEC = 3_600n;

/**
 * Pure classifier — determines what action (if any) to take on a decoded pool.
 * Exported for unit testing.
 */
export function classifyPool(
  pool: { state: number; totalTickets: bigint; closeTime: bigint },
  nowSec: bigint,
  stuckThresholdSec: bigint,
): PoolAction | null {
  if (pool.state === 0) {
    if (pool.closeTime <= nowSec && pool.totalTickets > 0n) return "commit";
    return null;
  }
  if (pool.state === 1) {
    const stuckAt = pool.closeTime + stuckThresholdSec;
    return nowSec >= stuckAt ? "stuck" : "settle";
  }
  return null; // state 2 (Resolved) or unknown
}

/**
 * Fetch all PrivatePool accounts and return those needing action.
 */
export async function scanActionablePools(
  rpcUrl: string,
  programId: string,
): Promise<ActionablePool[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  const accounts = (await (rpc.getProgramAccounts as never)(
    programId as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ dataSize: PRIVATE_POOL_SIZE }],
    },
  ).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;

  const decoder = getPrivatePoolDecoder();
  const result: ActionablePool[] = [];

  for (const acc of accounts) {
    try {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const pool = decoder.decode(bytes);
      const action = classifyPool(
        { state: Number(pool.state), totalTickets: pool.totalTickets, closeTime: pool.closeTime },
        nowSec,
        STUCK_THRESHOLD_SEC,
      );
      if (action) result.push({ address: acc.pubkey, pool, action });
    } catch {
      // Corrupt or unrecognised account — skip silently.
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd beta/keeper && npm test
```

Expected: PASS (all scan + wallet tests)

- [ ] **Step 5: Commit**

```bash
git add beta/keeper/src/scan.ts beta/keeper/src/__tests__/scan.test.ts
git commit -m "feat(keeper): pool scanner + classifier"
```

---

## Task 6: commit.ts

**Files:**
- Create: `beta/keeper/src/commit.ts`

Handles the full commit flow: create Switchboard randomness account (separate tx, must include randomness keypair as co-signer), then bundle `sbCommitIx + commitDrawPrivateIx` in one tx.

- [ ] **Step 1: Create `beta/keeper/src/commit.ts`**

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  Randomness,
  ON_DEMAND_DEVNET_QUEUE,
  ON_DEMAND_MAINNET_QUEUE,
  AnchorUtils,
} from "@switchboard-xyz/on-demand";
import { createKeyPairSignerFromBytes, createSolanaRpc, type Address } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { kitIxToWeb3, sendAndConfirm } from "./tx.js";
import { log } from "./logger.js";
import type { ActionablePool } from "./scan.js";

export async function commitPool(
  entry: ActionablePool,
  keeperKp: Keypair,
  connection: Connection,
  rpcUrl: string,
  cluster: "devnet" | "mainnet",
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "committing draw…");

  // ---- Switchboard setup ----
  const switchboardProgram = await AnchorUtils.loadProgramFromConnection(connection);
  const queuePk =
    cluster === "devnet" ? ON_DEMAND_DEVNET_QUEUE : ON_DEMAND_MAINNET_QUEUE;

  // ---- Step A: create randomness account (co-signed by fresh keypair) ----
  const randomnessKp = Keypair.generate();
  const [randomness, createIx] = await Randomness.create(
    switchboardProgram,
    randomnessKp,
    queuePk,
    keeperKp.publicKey,
  );
  await sendAndConfirm(connection, [createIx], [keeperKp, randomnessKp]);
  log(poolAddress, `randomness account created: ${randomness.pubkey.toBase58()}`);

  // ---- Step B: bundle sbCommit + commitDrawPrivate ----
  const sbCommitIx = await randomness.commitIx(queuePk, keeperKp.publicKey, undefined);
  const rpc = createSolanaRpc(rpcUrl as never);
  const client = new RaffleClient({ rpc });
  const callerSigner = await createKeyPairSignerFromBytes(keeperKp.secretKey);
  const raffleCommitIx = await client.commitDrawPrivate({
    caller: callerSigner,
    pool: poolAddress as Address,
    randomnessAccount: randomness.pubkey.toBase58() as Address,
  });

  await sendAndConfirm(connection, [sbCommitIx, kitIxToWeb3(raffleCommitIx)], [keeperKp]);
  log(poolAddress, "commitDrawPrivate confirmed — pool → AwaitingVrf");
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd beta/keeper && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add beta/keeper/src/commit.ts
git commit -m "feat(keeper): commitPool (Switchboard create + commitDrawPrivate)"
```

---

## Task 7: settle.ts

**Files:**
- Create: `beta/keeper/src/settle.ts`
- Create: `beta/keeper/src/__tests__/settle.test.ts`

Handles oracle polling, winner computation (pure + tested), and `settleDrawPrivate`.

- [ ] **Step 1: Write the failing test**

Create `beta/keeper/src/__tests__/settle.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeWinnerId, findWinningBatch } from "../settle.js";

describe("computeWinnerId", () => {
  it("reduces revealed value modulo totalTickets", () => {
    expect(computeWinnerId(10n, 7n)).toBe(3n); // 10 % 7 = 3
    expect(computeWinnerId(0n, 100n)).toBe(0n);
    expect(computeWinnerId(99n, 100n)).toBe(99n);
    expect(computeWinnerId(100n, 100n)).toBe(0n);
  });
});

describe("findWinningBatch", () => {
  const batches = [
    { batchAddress: "A", owner: "walletA", firstTicketId: 0n, lastTicketId: 4n },
    { batchAddress: "B", owner: "walletB", firstTicketId: 5n, lastTicketId: 9n },
    { batchAddress: "C", owner: "walletC", firstTicketId: 10n, lastTicketId: 14n },
  ];

  it("finds the batch containing winnerId at first ticket", () => {
    expect(findWinningBatch(batches, 0n)?.batchAddress).toBe("A");
  });

  it("finds the batch containing winnerId at last ticket", () => {
    expect(findWinningBatch(batches, 14n)?.batchAddress).toBe("C");
  });

  it("finds the batch containing winnerId in the middle", () => {
    expect(findWinningBatch(batches, 7n)?.batchAddress).toBe("B");
  });

  it("returns null when no batch contains winnerId", () => {
    expect(findWinningBatch(batches, 99n)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd beta/keeper && npm test
```

Expected: FAIL with "Cannot find module '../settle.js'"

- [ ] **Step 3: Implement `beta/keeper/src/settle.ts`**

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { Randomness, AnchorUtils } from "@switchboard-xyz/on-demand";
import { createKeyPairSignerFromBytes, createSolanaRpc, type Address } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { getTicketBatchDecoder } from "@tombola/sdk/generated/accounts/ticketBatch";
import { PROGRAM_ID } from "@tombola/sdk";
import { kitIxToWeb3, sendAndConfirm } from "./tx.js";
import { log, logError } from "./logger.js";
import type { ActionablePool } from "./scan.js";

// TicketBatch on-chain layout: discriminator(8) + pool(32) + owner(32) + ...
const TICKET_BATCH_SIZE = 89n;
const POOL_OFFSET = 8n;
// Max seconds to poll for oracle reveal before giving up this tick.
const REVEAL_TIMEOUT_MS = 60_000;
const REVEAL_POLL_INTERVAL_MS = 2_000;

export interface BatchView {
  batchAddress: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
}

/** Pure: compute winner ticket index. Mirrors on-chain logic. */
export function computeWinnerId(revealedValue: bigint, totalTickets: bigint): bigint {
  return revealedValue % totalTickets;
}

/** Pure: find the batch containing the winning ticket ID. */
export function findWinningBatch(
  batches: Pick<BatchView, "batchAddress" | "owner" | "firstTicketId" | "lastTicketId">[],
  winnerId: bigint,
): Pick<BatchView, "batchAddress" | "owner"> | null {
  return (
    batches.find((b) => b.firstTicketId <= winnerId && winnerId <= b.lastTicketId) ?? null
  );
}

/** Poll randomness.loadData() until the oracle has revealed or we time out. */
async function waitForReveal(randomness: Randomness): Promise<bigint | null> {
  const deadline = Date.now() + REVEAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await randomness.loadData() as any;
      const value: number[] = data?.value ?? [];
      if (value.some((b: number) => b !== 0)) {
        // Interpret first 8 bytes as u64 LE — same as on-chain reduction.
        let n = 0n;
        for (let i = 0; i < 8; i++) n |= BigInt(value[i] & 0xff) << (8n * BigInt(i));
        return n;
      }
    } catch {
      // transient read error — keep polling
    }
    await new Promise((r) => setTimeout(r, REVEAL_POLL_INTERVAL_MS));
  }
  return null; // oracle hasn't revealed within timeout
}

/** Fetch all TicketBatches for a pool, sorted by firstTicketId ascending. */
async function fetchBatches(rpcUrl: string, poolAddress: string): Promise<BatchView[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const accounts = (await (rpc.getProgramAccounts as never)(PROGRAM_ID as Address, {
    commitment: "confirmed",
    encoding: "base64",
    filters: [
      { dataSize: TICKET_BATCH_SIZE },
      {
        memcmp: {
          offset: POOL_OFFSET,
          bytes: poolAddress as never,
          encoding: "base58",
        },
      },
    ],
  }).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;

  const decoder = getTicketBatchDecoder();
  return accounts
    .map((acc) => {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const batch = decoder.decode(bytes);
      return {
        batchAddress: acc.pubkey,
        owner: String(batch.owner),
        firstTicketId: batch.firstTicketId,
        lastTicketId: batch.lastTicketId,
      };
    })
    .sort((a, b) => (a.firstTicketId < b.firstTicketId ? -1 : 1));
}

export async function settlePool(
  entry: ActionablePool,
  keeperKp: Keypair,
  connection: Connection,
  rpcUrl: string,
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "checking oracle reveal…");

  // ---- Get the randomness account address stored on-chain ----
  const vrfRequest = entry.pool.vrfRequest;
  // Kit Option<Address> decodes as { __option: 'Some'|'None', value? }
  const vrfAddr =
    typeof vrfRequest === "object" &&
    vrfRequest !== null &&
    "__option" in vrfRequest &&
    (vrfRequest as { __option: string; value?: string }).__option === "Some"
      ? (vrfRequest as { __option: string; value?: string }).value
      : null;

  if (!vrfAddr) {
    logError(poolAddress, "pool is in AwaitingVrf but vrfRequest is None", new Error("missing vrfRequest"));
    return;
  }

  // ---- Reconstruct Randomness object from the stored pubkey ----
  const switchboardProgram = await AnchorUtils.loadProgramFromConnection(connection);
  const randomness = new Randomness(switchboardProgram, new PublicKey(vrfAddr));

  // ---- Poll for oracle reveal ----
  const revealedValue = await waitForReveal(randomness);
  if (revealedValue === null) {
    log(poolAddress, "oracle has not revealed yet — will retry next tick");
    return;
  }
  log(poolAddress, `oracle revealed: ${revealedValue}`);

  // ---- Compute winner ----
  const totalTickets = entry.pool.totalTickets;
  const winnerId = computeWinnerId(revealedValue, totalTickets);
  log(poolAddress, `winner ticket: ${winnerId} of ${totalTickets}`);

  // ---- Find winning batch ----
  const batches = await fetchBatches(rpcUrl, poolAddress);
  const winningBatch = findWinningBatch(batches, winnerId);
  if (!winningBatch) {
    logError(poolAddress, `no batch contains winner_id=${winnerId}`, new Error("batch not found"));
    return;
  }
  log(poolAddress, `winning batch: ${winningBatch.batchAddress}, winner: ${winningBatch.owner}`);

  // ---- Fetch treasury from protocol config ----
  const rpc = createSolanaRpc(rpcUrl as never);
  const client = new RaffleClient({ rpc });
  const config = await client.getProtocolConfig();
  const treasury = config.treasury as string;

  // ---- Bundle sbReveal + settleDrawPrivate ----
  const sbRevealIx = await randomness.revealIx(keeperKp.publicKey);
  const callerSigner = await createKeyPairSignerFromBytes(keeperKp.secretKey);
  const settleIx = await client.settleDrawPrivate({
    caller: callerSigner,
    pool: poolAddress as Address,
    winningBatch: winningBatch.batchAddress as Address,
    winner: winningBatch.owner as Address,
    creator: entry.pool.creator as string as Address,
    treasury: treasury as Address,
    randomnessAccount: vrfAddr as Address,
  });

  await sendAndConfirm(connection, [sbRevealIx, kitIxToWeb3(settleIx)], [keeperKp]);
  log(poolAddress, `settleDrawPrivate confirmed — winner: ${winningBatch.owner}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd beta/keeper && npm test
```

Expected: PASS (all wallet + scan + settle tests)

- [ ] **Step 5: Run typecheck**

```bash
cd beta/keeper && npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add beta/keeper/src/settle.ts beta/keeper/src/__tests__/settle.test.ts
git commit -m "feat(keeper): settlePool — oracle polling + winner compute + settleDrawPrivate"
```

---

## Task 8: index.ts — Main Poll Loop

**Files:**
- Create: `beta/keeper/src/index.ts`

Entry point: validates env vars, builds shared resources once (Connection, Keypair), then loops forever.

- [ ] **Step 1: Create `beta/keeper/src/index.ts`**

```typescript
import { Connection } from "@solana/web3.js";
import { loadKeeperKeypair } from "./wallet.js";
import { logInfo, log, logError } from "./logger.js";
import { scanActionablePools } from "./scan.js";
import { commitPool } from "./commit.js";
import { settlePool } from "./settle.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required env var ${name} is not set`);
  return v;
}

async function runTick(ctx: {
  rpcUrl: string;
  programId: string;
  connection: Connection;
  cluster: "devnet" | "mainnet";
  keeperKp: ReturnType<typeof loadKeeperKeypair>;
}): Promise<void> {
  const pools = await scanActionablePools(ctx.rpcUrl, ctx.programId);
  logInfo(`tick: ${pools.length} actionable pool(s) found`);

  for (const entry of pools) {
    if (entry.action === "stuck") {
      log(entry.address, "WARNING: oracle has been stuck >1h — manual recovery needed");
      continue;
    }
    try {
      if (entry.action === "commit") {
        await commitPool(entry, ctx.keeperKp, ctx.connection, ctx.rpcUrl, ctx.cluster);
      } else {
        await settlePool(entry, ctx.keeperKp, ctx.connection, ctx.rpcUrl);
      }
    } catch (err) {
      logError(entry.address, `${entry.action} failed`, err);
    }
  }
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv("SOLANA_RPC_URL");
  const programId = requireEnv("PROGRAM_ID");
  const cluster = (process.env.SB_CLUSTER ?? "devnet") as "devnet" | "mainnet";
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? "30000");

  const keeperKp = loadKeeperKeypair(); // throws immediately if env is wrong
  logInfo(`keeper starting — wallet: ${keeperKp.publicKey.toBase58()}`);
  logInfo(`rpc: ${rpcUrl} | program: ${programId} | cluster: ${cluster} | poll: ${intervalMs}ms`);

  const connection = new Connection(rpcUrl, "confirmed");

  const ctx = { rpcUrl, programId, connection, cluster, keeperKp };

  // Run first tick immediately, then on interval.
  await runTick(ctx);
  setInterval(() => {
    runTick(ctx).catch((err: unknown) => {
      logInfo(`tick error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, intervalMs);
}

main().catch((err: unknown) => {
  console.error("keeper failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run typecheck**

```bash
cd beta/keeper && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Verify all tests still pass**

```bash
cd beta/keeper && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add beta/keeper/src/index.ts
git commit -m "feat(keeper): main poll loop"
```

---

## Task 9: Smoke-test locally + Railway deploy

**Files:**
- No new files.

- [ ] **Step 1: Set env vars for local test run**

Create a `.env.local` file (do NOT commit this):

```bash
# .env.local — for local dry-run only, never commit
KEEPER_KEYPAIR='[...your treasury keypair JSON...]'
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M
SB_CLUSTER=devnet
POLL_INTERVAL_MS=10000
```

- [ ] **Step 2: Run keeper locally for one tick**

```bash
cd beta/keeper && source .env.local && npm start
```

Expected output (example):
```
2026-05-10T12:00:00.000Z keeper starting — wallet: <pubkey>
2026-05-10T12:00:00.000Z rpc: https://api.devnet.solana.com | program: qWyk...B1M | cluster: devnet | poll: 10000ms
2026-05-10T12:00:01.000Z tick: 1 actionable pool(s) found
2026-05-10T12:00:01.000Z [FHDQ…] committing draw…
2026-05-10T12:00:03.000Z [FHDQ…] randomness account created: <pubkey>
2026-05-10T12:00:05.000Z [FHDQ…] commitDrawPrivate confirmed — pool → AwaitingVrf
... (wait ~30s for oracle to reveal)
2026-05-10T12:00:11.000Z tick: 1 actionable pool(s) found
2026-05-10T12:00:11.000Z [FHDQ…] oracle revealed: <value>
2026-05-10T12:00:11.000Z [FHDQ…] winner ticket: 37 of 102
2026-05-10T12:00:12.000Z [FHDQ…] winning batch: <addr>, winner: <wallet>
2026-05-10T12:00:14.000Z [FHDQ…] settleDrawPrivate confirmed — winner: <wallet>
2026-05-10T12:00:14.000Z tick: 0 actionable pool(s) found
```

If the commit tx is confirmed but settle says "oracle has not revealed yet", wait for the next poll interval. The Switchboard devnet oracle typically reveals within a few seconds of the commit slot.

- [ ] **Step 3: Deploy to Railway**

In the Railway dashboard:
1. Create a new service in your project
2. Connect to the `tombola-frontend` GitHub repo
3. Set **Root Directory** to `beta/keeper`
4. Set **Start Command** to `npm start` (Railway will run `npm install` automatically via Nixpacks)
5. Add environment variables:
   - `KEEPER_KEYPAIR` = (paste the treasury keypair JSON array)
   - `SOLANA_RPC_URL` = `https://api.devnet.solana.com`
   - `PROGRAM_ID` = `qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M`
   - `SB_CLUSTER` = `devnet`

- [ ] **Step 4: Final commit**

```bash
git add beta/keeper/
git commit -m "feat(keeper): complete keeper daemon — commit + settle private pools"
```

---

## Self-Review

**Spec coverage:**
- ✅ Poll loop: `index.ts` with 30s interval
- ✅ State 0 + closed + tickets > 0 → commit: `commitPool` in `commit.ts`
- ✅ State 1 → settle: `settlePool` in `settle.ts`
- ✅ Stuck oracle warning: `index.ts` logs warning when `action === "stuck"`
- ✅ `KEEPER_KEYPAIR` / `SOLANA_RPC_URL` / `PROGRAM_ID` / `SB_CLUSTER` / `POLL_INTERVAL_MS`: all in `index.ts`
- ✅ Railway deployment: `railway.toml` + Task 9 step 3
- ✅ Single pool failure doesn't kill loop: try/catch per pool in `runTick`

**Type consistency:**
- `ActionablePool` defined in `scan.ts`, imported in `commit.ts`, `settle.ts`, `index.ts` — consistent
- `BatchView` defined and used only in `settle.ts` — consistent
- `computeWinnerId(bigint, bigint): bigint` and `findWinningBatch(BatchView[], bigint)` — consistent with test cases

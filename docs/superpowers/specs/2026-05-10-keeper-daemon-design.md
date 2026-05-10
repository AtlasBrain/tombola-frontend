# Tombola Keeper Daemon Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A standalone Node.js service that automatically triggers the commit→oracle-wait→settle cycle for private pools that have passed their `close_time` but haven't been drawn yet.

**Architecture:** Stateless 30-second poll loop deployed as a Railway service. Each tick scans all PrivatePool accounts on-chain, classifies them by state, and dispatches the appropriate action. All decisions are derived from live on-chain data — no local database or file state.

**Tech stack:** Node.js 20, TypeScript, `@switchboard-xyz/on-demand`, `@solana/web3.js` v1 (for Switchboard compatibility), `@solana/kit` (for raffle program interactions).

---

## File Structure

```
beta/keeper/
  src/
    index.ts      — entry point: env validation, poll loop, top-level error handling
    scan.ts       — getProgramAccounts → decode PrivatePool → return actionable list
    commit.ts     — create Switchboard randomness account + commitDrawPrivate bundle
    settle.ts     — poll oracle reveal + compute winner + settleDrawPrivate bundle
    wallet.ts     — load keypair from KEEPER_KEYPAIR env var
    tx.ts         — shared tx-building helpers (Kit + web3.js bridge)
    logger.ts     — structured console.log with timestamp and pool address prefix
  package.json
  tsconfig.json
  railway.toml
```

---

## State Machine

The keeper handles two pool states:

### State 0 → Commit

**Condition:** `pool.state === 0` AND `pool.closeTime <= now` AND `pool.totalTickets > 0`

**Action:**
1. Generate a new Switchboard randomness keypair (`Keypair.generate()`)
2. Create the randomness account on-chain: `Randomness.create(switchboardProgram, randomnessKp, queuePk, payerPk)` → `sendWeb3Tx([createIx], [payer, randomnessKp])`
3. Bundle in a single tx: `randomness.commitIx(queuePk, payerPk)` + `client.commitDrawPrivate({ pool, randomnessAccount, caller })`
4. Pool transitions to state 1; `pool.vrfRequest` is set to the randomness pubkey on-chain

### State 1 → Settle

**Condition:** `pool.state === 1`

**Action:**
1. Read `pool.vrfRequest` (the randomness account address stored on-chain during commit)
2. Load the randomness account via `Randomness` object
3. Poll `randomness.loadData()` every 2s; if `data.value` has any non-zero byte, the oracle has revealed
4. Decode the revealed value: interpret first 8 bytes as u64 LE → `revealedValue`
5. Compute `winnerId = revealedValue % pool.totalTickets`
6. Walk TicketBatch accounts to find the one where `firstTicketId <= winnerId <= lastTicketId`
7. Read the winning batch's `owner` field → `winnerAddress`
8. Fetch `protocolConfig.treasury`
9. Bundle in a single tx: `randomness.revealIx(payerPk)` + `client.settleDrawPrivate({ pool, winningBatch, winner, creator, treasury, randomnessAccount, caller })`
10. Pool transitions to state 2 (Resolved)

**Stuck oracle (>1h with no reveal):** Log a warning with pool address. Private pools have no on-chain `retryDraw` instruction; recovery requires operator intervention.

---

## Env Vars

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KEEPER_KEYPAIR` | Yes | — | Treasury keypair as JSON array of numbers (same format as `gen-treasury.mjs` output) |
| `SOLANA_RPC_URL` | Yes | — | Devnet or mainnet RPC endpoint |
| `PROGRAM_ID` | Yes | — | Raffle program public key |
| `POLL_INTERVAL_MS` | No | `30000` | Poll frequency in ms |
| `SB_CLUSTER` | No | `devnet` | `devnet` or `mainnet` for Switchboard queue selection |

---

## Poll Loop

```
every POLL_INTERVAL_MS:
  1. getProgramAccounts(PROGRAM_ID, { dataSize: 216 }) → all PrivatePool accounts
  2. decode each with PrivatePool decoder
  3. for each pool where state === 0 + closeTime <= now + totalTickets > 0:
       commit(pool)                      ← sequential, not parallel (each needs its own randomness keypair)
  4. for each pool where state === 1:
       settle(pool)                      ← sequential
  5. log summary: N committed, M settled, K still awaiting oracle
```

Sequential (not parallel) to avoid nonce/blockhash conflicts and simplify error recovery.

---

## Winner Computation

Mirror of the on-chain logic in `settle_draw_private.rs`:

```
winnerId = revealedValue % totalTickets

Walk batches in firstTicketId order:
  batch 0: firstTicketId=0,  lastTicketId=qty0-1
  batch 1: firstTicketId=qty0, lastTicketId=qty0+qty1-1
  ...
  Return the batch where firstTicketId <= winnerId <= lastTicketId
```

Batches are fetched via `getProgramAccounts` with memcmp filter on `pool` field (offset 8), same as `get-pool-detail.ts`.

---

## Deployment

`beta/keeper/railway.toml`:
- Builder: `NIXPACKS` (Node.js, no Docker needed)
- Start command: `npm start` → `node dist/index.js`
- Restart policy: `ON_FAILURE`
- No healthcheck endpoint needed (it's a worker, not a server)

Required Railway env vars: `KEEPER_KEYPAIR`, `SOLANA_RPC_URL`, `PROGRAM_ID`.

---

## Error Handling

- **Single pool failure doesn't stop the loop:** each `commit(pool)` and `settle(pool)` is wrapped in try/catch; log the error and continue to the next pool.
- **Tx simulation failure on commit:** the pool may have already been committed by a race (another keeper instance or manual tx). On next tick, pool will be in state 1 and handled by settle.
- **Randomness account already exists:** `Randomness.create` will fail; same race condition as above — safe to ignore.
- **RPC errors:** caught at the poll level; log and wait for next tick.

---

## What's Out of Scope

- Public pool keepering (separate concern; public pools have `retryDrawPublic` on-chain)
- Alerting / Slack notifications on stuck pools (log-only for now)
- Multiple keeper instances coordination (first-writer-wins at the chain level is safe; duplicate commits are idempotent from the on-chain program's perspective after state 0 → 1 transition)

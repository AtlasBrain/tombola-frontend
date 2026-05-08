// Mock pool data for Phase 1 of the frontend build.
//
// Shape mirrors the on-chain `PublicPool` account from the Tombola program
// (programs/raffle/src/state.rs in the Project-Tombola repo). When Phase 3
// lands and we plug in the real RPC reads via the Tombola SDK, these mock
// objects will be replaced with `client.getPublicPool(...)` results — the
// PoolView shape is what the UI actually consumes, decoupled from the wire
// account layout.

export type PoolKind = "Weekly" | "Biweekly" | "Triweekly" | "Monthly";

export type PoolState = "Open" | "AwaitingVrf" | "Resolved";

export interface PoolView {
  /** Display name. */
  kind: PoolKind;
  /** On-chain pool_type discriminant — matches `state.rs::PoolType`. */
  poolType: 0 | 1 | 2 | 3;
  /** Current round number. Bumps after each draw via `reopen_public_pool`. */
  round: bigint;
  state: PoolState;
  /** Total tickets bought so far in the current round. */
  totalTickets: bigint;
  /** Total pot in lamports (10^9 lamports = 1 SOL). */
  totalPotLamports: bigint;
  /** Unix epoch seconds when the round closes and a draw can be triggered. */
  closeTimeUnix: number;
  /** Per-ticket price in lamports (uniform 10_000_000 = 0.01 SOL across all four pools). */
  ticketPriceLamports: bigint;
  /** PublicPool PDA address. Present on live data; undefined for offline mocks. */
  poolAddress?: string;
}

const HOUR = 3600;
const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);

/**
 * Realistic-looking mock data. Pots and ticket counts are scaled by the
 * cadence (longer pools accumulate more) so the UI looks lived-in. Replace
 * with real `RaffleClient.getPublicPool(...)` calls in Phase 3.
 */
export const MOCK_POOLS: PoolView[] = [
  {
    kind: "Weekly",
    poolType: 0,
    round: 12n,
    state: "Open",
    totalTickets: 138n,
    totalPotLamports: 1_380_000_000n, // 1.38 SOL
    closeTimeUnix: NOW + 3 * DAY + 14 * HOUR,
    ticketPriceLamports: 10_000_000n,
  },
  {
    kind: "Biweekly",
    poolType: 1,
    round: 6n,
    state: "Open",
    totalTickets: 312n,
    totalPotLamports: 3_120_000_000n, // 3.12 SOL
    closeTimeUnix: NOW + 8 * DAY + 4 * HOUR,
    ticketPriceLamports: 10_000_000n,
  },
  {
    kind: "Triweekly",
    poolType: 2,
    round: 4n,
    state: "AwaitingVrf",
    totalTickets: 487n,
    totalPotLamports: 4_870_000_000n, // 4.87 SOL
    closeTimeUnix: NOW - 2 * HOUR,
    ticketPriceLamports: 10_000_000n,
  },
  {
    kind: "Monthly",
    poolType: 3,
    round: 3n,
    state: "Open",
    totalTickets: 1024n,
    totalPotLamports: 10_240_000_000n, // 10.24 SOL
    closeTimeUnix: NOW + 22 * DAY + 9 * HOUR,
    ticketPriceLamports: 10_000_000n,
  },
];

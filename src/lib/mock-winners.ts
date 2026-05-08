// Mock recent-winners data. Same mock-then-swap discipline as MOCK_POOLS:
// the WinnerView shape mirrors what an on-chain RaffleClient.getResolvedPool()
// (or an event log query) will return when phase 7 lands the live wiring.
//
// On-chain source-of-truth: a Resolved pool account holds (winner_owner,
// winner_ticket_id, total_pot_lamports, close_time_unix, fee_bps) — the
// fields below derive trivially from those.

import type { PoolKind } from "./mock-pools";

export interface WinnerView {
  poolKind: PoolKind;
  round: bigint;
  /** base58 owner address of the winning ticket. */
  winnerAddress: string;
  /** Pot minus the 0.5% protocol fee (what actually landed in the winner's wallet). */
  payoutLamports: bigint;
  /** Unix epoch seconds when the round closed (close_time_unix). */
  resolvedAtUnix: number;
  /** Settle-draw tx signature, if known. Links to explorer. */
  txSignature?: string;
}

const HOUR = 3600;
const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);

export const MOCK_WINNERS: WinnerView[] = [
  {
    poolKind: "Weekly",
    round: 11n,
    winnerAddress: "9xQTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY8",
    payoutLamports: 1_372_500_000n, // 1.38 SOL minus 0.5%
    resolvedAtUnix: NOW - 3 * DAY,
    txSignature: "5ZPR4hG86n18qA2Um3ZXscqiHipsjS8yPKcj4Xiajen9fNMpWzWYKJ7eTNtbGTxr2oHUJEs1i4FpUqZhzvMQe74B",
  },
  {
    poolKind: "Biweekly",
    round: 5n,
    winnerAddress: "EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt",
    payoutLamports: 3_104_400_000n, // 3.12 SOL minus 0.5%
    resolvedAtUnix: NOW - 7 * DAY,
    txSignature: "62gyb8rTsNZKdfnpkZuyrPHnSuQZAtRhQQdjgAZF1azNuLHKR1VQZRWtqfMUJiTof4D8XMjx6hTvsYvn8Dqh96YK",
  },
  {
    poolKind: "Triweekly",
    round: 3n,
    winnerAddress: "qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M",
    payoutLamports: 4_845_650_000n, // 4.87 SOL minus 0.5%
    resolvedAtUnix: NOW - 12 * DAY,
  },
  {
    poolKind: "Weekly",
    round: 10n,
    winnerAddress: "HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW",
    payoutLamports: 875_625_000n, // 0.88 SOL minus 0.5%
    resolvedAtUnix: NOW - 14 * DAY,
  },
  {
    poolKind: "Monthly",
    round: 2n,
    winnerAddress: "2uHKExQfGnm5UkLEyYc2kMBaWvsJviRRPF7XATP5z8JA",
    payoutLamports: 10_188_800_000n, // 10.24 SOL minus 0.5%
    resolvedAtUnix: NOW - 21 * DAY,
    txSignature: "3iXYxv5itgu4zQDZAbj5uzEnSg9wugMjwKSUZxTWYpqpqMgBzz7EWuudaR47FyCBkWfPNtSLhJDB1AkPDZX2ifiv",
  },
  {
    poolKind: "Weekly",
    round: 9n,
    winnerAddress: "AxWU6PTuC4W2nriNJ1Btzd1uqbMmUMQUvPJ58QH2cW7v",
    payoutLamports: 1_213_700_000n, // 1.22 SOL minus 0.5%
    resolvedAtUnix: NOW - 17 * DAY - 6 * HOUR,
  },
];

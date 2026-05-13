import type { WalletBalances } from "./token-balance.js";

export type WalletState =
  | "none"
  | "has-wallet-zero-balance"
  | "has-wallet-stable-only"
  | "has-wallet-with-sol";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const TX_FEE_BUFFER_LAMPORTS = 5_000_000n; // ~0.005 SOL for tx fees + rent

export interface ClassifyInput {
  walletAddress: string | null;
  balances: WalletBalances | null;
  ticketPriceLamports: bigint;
  solUsd: number; // price for USDC/USDT → SOL-equivalent comparison
}

export function classifyWalletState(input: ClassifyInput): WalletState {
  if (!input.walletAddress) return "none";
  if (!input.balances) return "has-wallet-zero-balance"; // conservative default

  const requiredLamports = input.ticketPriceLamports + TX_FEE_BUFFER_LAMPORTS;
  if (input.balances.sol_lamports >= requiredLamports) {
    return "has-wallet-with-sol";
  }

  // ticket cost in USD = (ticketPriceLamports / LAMPORTS_PER_SOL) * solUsd
  // stable threshold = 110% of ticket cost (slippage + swap fee margin)
  const ticketSol = Number(input.ticketPriceLamports) / Number(LAMPORTS_PER_SOL);
  const ticketUsdCents = Math.ceil(ticketSol * input.solUsd * 100 * 1.1);
  const stableThresholdAtoms = BigInt(ticketUsdCents * 10_000); // USD-cents → 6-decimal atoms

  if (
    input.balances.usdc_atoms >= stableThresholdAtoms ||
    input.balances.usdt_atoms >= stableThresholdAtoms
  ) {
    return "has-wallet-stable-only";
  }

  return "has-wallet-zero-balance";
}

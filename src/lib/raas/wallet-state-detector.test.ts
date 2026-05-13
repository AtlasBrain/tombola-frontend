import { describe, it, expect } from "vitest";
import { classifyWalletState } from "./wallet-state-detector.js";

const TICKET_PRICE_SOL = 0.05;
const TICKET_PRICE_LAMPORTS = 50_000_000n;
const SOL_USD = 200; // fixture price

describe("classifyWalletState", () => {
  it("returns 'none' if no wallet address", () => {
    expect(
      classifyWalletState({
        walletAddress: null,
        balances: null,
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("none");
  });

  it("returns 'has-wallet-with-sol' when SOL >= ticket + buffer", () => {
    expect(
      classifyWalletState({
        walletAddress: "Wallet1",
        balances: { sol_lamports: 100_000_000n, usdc_atoms: 0n, usdt_atoms: 0n },
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("has-wallet-with-sol");
  });

  it("returns 'has-wallet-stable-only' when SOL low but USDC >= ticket equivalent", () => {
    // ticket = $10 (0.05 SOL × $200). USDC has 6 decimals → 10_000_000 atoms = $10.
    expect(
      classifyWalletState({
        walletAddress: "Wallet1",
        balances: { sol_lamports: 100_000n, usdc_atoms: 15_000_000n, usdt_atoms: 0n },
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("has-wallet-stable-only");
  });

  it("returns 'has-wallet-stable-only' when USDT >= ticket equivalent", () => {
    expect(
      classifyWalletState({
        walletAddress: "Wallet1",
        balances: { sol_lamports: 100_000n, usdc_atoms: 0n, usdt_atoms: 15_000_000n },
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("has-wallet-stable-only");
  });

  it("returns 'has-wallet-zero-balance' when nothing meets threshold", () => {
    expect(
      classifyWalletState({
        walletAddress: "Wallet1",
        balances: { sol_lamports: 100_000n, usdc_atoms: 0n, usdt_atoms: 0n },
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("has-wallet-zero-balance");
  });

  it("treats balances=null (loading) as has-wallet-zero-balance for safe default", () => {
    // While balances are loading, show the deposit/buy options conservatively.
    expect(
      classifyWalletState({
        walletAddress: "Wallet1",
        balances: null,
        ticketPriceLamports: TICKET_PRICE_LAMPORTS,
        solUsd: SOL_USD,
      }),
    ).toBe("has-wallet-zero-balance");
  });
});

import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { USDC_MINT_MAINNET, USDC_MINT_DEVNET } from "./usdc-mint.js";

const USDT_MINT_MAINNET = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export interface WalletBalances {
  sol_lamports: bigint;
  usdc_atoms: bigint; // 6 decimals
  usdt_atoms: bigint; // 6 decimals
}

export async function fetchWalletBalances(
  walletAddress: string,
  rpcUrl: string,
): Promise<WalletBalances> {
  const conn = new Connection(rpcUrl, "confirmed");
  const wallet = new PublicKey(walletAddress);

  const usdc = rpcUrl.includes("devnet") ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
  const usdt = USDT_MINT_MAINNET;

  // Parallel: SOL balance + parsed token accounts.
  const [solLamports, tokenAccounts] = await Promise.all([
    conn.getBalance(wallet),
    conn.getParsedTokenAccountsByOwner(wallet, {
      programId: new PublicKey(SPL_TOKEN_PROGRAM_ID),
    }),
  ]);

  let usdc_atoms = 0n;
  let usdt_atoms = 0n;
  for (const acc of tokenAccounts.value) {
    const mint = acc.account.data.parsed.info.mint as string;
    const amount = BigInt(acc.account.data.parsed.info.tokenAmount.amount);
    if (mint === usdc) usdc_atoms += amount;
    if (mint === usdt) usdt_atoms += amount;
  }

  return {
    sol_lamports: BigInt(solLamports),
    usdc_atoms,
    usdt_atoms,
  };
}

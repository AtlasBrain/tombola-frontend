// USDC SPL mint addresses on Solana.
// https://developers.circle.com/stablecoins/docs/usdc-on-main-networks

export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function usdcMintFor(rpcUrl: string): string {
  if (rpcUrl.includes("devnet")) return USDC_MINT_DEVNET;
  return USDC_MINT_MAINNET;
}

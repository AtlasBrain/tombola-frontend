import { NextResponse } from "next/server";
import { fetchWalletBalances } from "@/lib/raas/token-balance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  try {
    const bal = await fetchWalletBalances(pubkey, rpcUrl);
    return NextResponse.json({
      sol_lamports: bal.sol_lamports.toString(),
      usdc_atoms: bal.usdc_atoms.toString(),
      usdt_atoms: bal.usdt_atoms.toString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

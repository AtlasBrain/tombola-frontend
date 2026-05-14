// src/lib/raas/operator-auth.ts — Operator allow-list helpers.
// Reads RAAS_OPERATOR_WALLETS (comma-separated base58 pubkeys) from env.

export function getOperatorWallets(): string[] {
  return (process.env.RAAS_OPERATOR_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isOperator(wallet: string): boolean {
  return getOperatorWallets().includes(wallet);
}

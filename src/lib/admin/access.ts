// Admin allow-list check.
//
// The list of admin wallets is configured via the `ADMIN_WALLETS` env var
// — a comma-separated list of base58 pubkeys. Empty / unset = no admins,
// dashboard inaccessible to everyone (safe default).
//
// We read the env var at call time, not module load time, so rotation
// doesn't require a redeploy of every serverless lambda. Cheap enough
// (single env read + split).

/** Returns true iff `wallet` is in the comma-separated ADMIN_WALLETS env.
 *  Whitespace tolerant. Case-sensitive on the pubkey itself (base58 IS
 *  case-sensitive). */
export function isAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  const raw = process.env.ADMIN_WALLETS;
  if (!raw) return false;
  // Split on comma, trim entries, drop empties. Guard against
  // accidental quoting / whitespace from .env files.
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.includes(wallet);
}

/** True if at least one admin wallet is configured. Used by the layout to
 *  decide whether to render the access-denied screen or the
 *  "admin-not-configured" screen (helpful in dev). */
export function adminConfigured(): boolean {
  const raw = process.env.ADMIN_WALLETS;
  if (!raw) return false;
  return raw.split(",").some((s) => s.trim().length > 0);
}

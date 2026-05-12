// Canonical message strings the wallet signs for each pool-invite
// action. Lives in its own module so both the client (which builds the
// message to sign) and the server (which rebuilds it to verify) import
// the same source of truth — no chance of a typo making a signature
// non-replayable for one side but valid for the other.
//
// Each verb embeds the nonce + every consequential argument so a
// signature for one action can't be replayed as another.

export type PoolInviteAction = "create" | "claim" | "revoke";

export function createInviteMessage(
  pool: string,
  friend: string,
  nonce: string,
): string {
  return `tombola:pool-invite:create:${pool}:${friend}:${nonce}`;
}

/** Batch-create message — signs over the SORTED list of friend wallets so
 *  the order they're passed in doesn't affect the canonical message. The
 *  server re-sorts when verifying. Inviter signs once; server fans out N
 *  store writes. */
export function createInviteBatchMessage(
  pool: string,
  friends: readonly string[],
  nonce: string,
): string {
  const sorted = [...friends].sort();
  return `tombola:pool-invite:create-batch:${pool}:${sorted.join(",")}:${nonce}`;
}

export function claimInviteMessage(pool: string, nonce: string): string {
  return `tombola:pool-invite:claim:${pool}:${nonce}`;
}

export function revokeInviteMessage(
  pool: string,
  friend: string,
  nonce: string,
): string {
  return `tombola:pool-invite:revoke:${pool}:${friend}:${nonce}`;
}

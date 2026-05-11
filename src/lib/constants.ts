// On-chain layout constants for the raffle program.
//
// These mirror byte-sizes / offsets / fee parameters defined in the Anchor
// program (see programs/raffle/src/state/*.rs and constants.rs). They're
// duplicated in the frontend because `getProgramAccounts` filters need
// concrete numbers — there's no SDK export that surfaces these today.
//
// If the on-chain layout ever changes, update HERE and grep for any stragglers.

/** TicketBatch account size in bytes: 8-byte discriminator + pool(32) +
 *  owner(32) + first_ticket_id(8) + last_ticket_id(8) + 1 = 89. */
export const TICKET_BATCH_SIZE = 89n;
export const TICKET_BATCH_SIZE_N = 89;

/** PublicPool account size in bytes (anchor-encoded layout). */
export const PUBLIC_POOL_SIZE = 150n;
export const PUBLIC_POOL_SIZE_N = 150;

/** PrivatePool account size in bytes (anchor-encoded layout). */
export const PRIVATE_POOL_SIZE = 216n;
export const PRIVATE_POOL_SIZE_N = 216;

/** Offset of `pool` (Pubkey) inside TicketBatch. After 8-byte discriminator. */
export const TICKET_BATCH_POOL_OFFSET = 8;

/** Offset of `owner` (Pubkey) inside TicketBatch.
 *  After 8-byte discriminator + pool(32). */
export const TICKET_BATCH_OWNER_OFFSET = 40;

/** Byte offset of the `state` enum field inside a PrivatePool account.
 *  Anchor layout (see vendor/sdk/generated/accounts/privatePool.ts):
 *    8  discriminator
 *    32 creator
 *    8  poolId
 *    8  openTime
 *    8  closeTime
 *    8  ticketPrice
 *    2  creatorFeeBps
 *    1  accessMode
 *    32 merkleRoot
 *    8  totalTickets
 *    8  totalPot
 *    => state at offset 123 (single-byte enum: 0=Open, 1=AwaitingVrf, 2=Resolved)
 *
 *  Used by the keeper to memcmp-filter only actionable states (saves an RPC
 *  full-table scan every tick once we have many Resolved pools). */
export const PRIVATE_POOL_STATE_OFFSET = 123;

/** Protocol fee in basis points. Mirror of `PROTOCOL_FEE_BPS` in constants.rs. */
export const PROTOCOL_FEE_BPS = 50n;

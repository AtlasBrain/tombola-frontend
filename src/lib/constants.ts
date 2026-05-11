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

/** Protocol fee in basis points. Mirror of `PROTOCOL_FEE_BPS` in constants.rs. */
export const PROTOCOL_FEE_BPS = 50n;

// Tombola SDK public surface.
//
// Three layers, in order of how most consumers should use them:
//   1. RaffleClient (./client) — high-level facade; what most callers want.
//   2. Domain helpers (./codes, ./merkle, ./pdas) — for off-chain code generation,
//      proof construction, and explicit PDA derivation.
//   3. Codama-generated Kit-compatible client (./generated) — the raw instruction
//      builders + account decoders. Exposed for advanced consumers; usually
//      RaffleClient is enough.

export {
  RaffleClient,
  PoolType,
  POOL_DURATION_SECONDS,
  TICKET_PRICE_LAMPORTS,
} from "./client.js";
export type {
  RaffleClientConfig,
  RaffleRpc,
  PoolTypeValue,
  ProtocolConfig,
  PublicPool,
  PrivatePool,
  PoolTypeCounter,
  TicketBatch,
  RedeemedCode,
  Whitelisted,
  AccessModeArgs,
  CodeTree,
} from "./client.js";
export { AccessMode } from "./client.js";

export {
  PROGRAM_ID,
  findConfigPda,
  findCounterPda,
  findPublicPoolPda,
  findPrivatePoolPda,
  findTicketBatchPda,
  findRedeemedCodePda,
  findWhitelistedPda,
} from "./pdas.js";

export { hashLeaf, buildTree, proofFor, verifyProof } from "./merkle.js";

export {
  DEFAULT_CODE_BYTE_LEN,
  generateInviteCode,
  encodeCode,
  hashCode,
  buildCodeTree,
} from "./codes.js";

// Raw generated client (advanced consumers).
export * as generated from "./generated/index.js";

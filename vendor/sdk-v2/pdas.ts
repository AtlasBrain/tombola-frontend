// PDA derivations matching every seed expression in programs/raffle/src/state.rs.
// Cross-checked against @solana/web3.js v1's findProgramAddressSync in tests.
//
// Seeds (from programs/raffle/src/constants.rs):
//   ProtocolConfig:    [b"config"]
//   PoolTypeCounter:   [b"counter", &[pool_type]]
//   PublicPool:        [b"public_pool", &[pool_type], &round.to_le_bytes()]
//   PrivatePool:       [b"private_pool", creator, &pool_id.to_le_bytes()]
//   TicketBatch:       [b"batch", pool, &first_ticket_id.to_le_bytes()]
//   RedeemedCode:      [b"redeem", pool, &code_hash]                  (32-byte hash)
//   Whitelisted:       [b"whitelisted", pool, wallet]

import {
  type Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
} from "@solana/kit";

export const PROGRAM_ID = "AVbducCFnioqM8j8S6DVe6xK3DS79Bf7ciVVv8d37XLQ";

const SEED_CONFIG = "config";
const SEED_COUNTER = "counter";
const SEED_PUBLIC_POOL = "public_pool";
const SEED_PRIVATE_POOL = "private_pool";
const SEED_BATCH = "batch";
const SEED_REDEEM = "redeem";
const SEED_WHITELISTED = "whitelisted";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const addressBytes = (a: Address): Uint8Array =>
  Uint8Array.from(getAddressEncoder().encode(a));
const u64LeBytes = (n: bigint): Uint8Array =>
  Uint8Array.from(getU64Encoder().encode(n));
const u8Byte = (n: number): Uint8Array => {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new Error(`u8 byte out of range: ${n}`);
  }
  return new Uint8Array([n]);
};

export async function findConfigPda(
  programId: Address,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_CONFIG)],
  });
  return [pda, bump];
}

export async function findCounterPda(
  programId: Address,
  poolType: number,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_COUNTER), u8Byte(poolType)],
  });
  return [pda, bump];
}

export async function findPublicPoolPda(
  programId: Address,
  poolType: number,
  round: bigint,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_PUBLIC_POOL), u8Byte(poolType), u64LeBytes(round)],
  });
  return [pda, bump];
}

export async function findPrivatePoolPda(
  programId: Address,
  creator: Address,
  poolId: bigint,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_PRIVATE_POOL), addressBytes(creator), u64LeBytes(poolId)],
  });
  return [pda, bump];
}

export async function findTicketBatchPda(
  programId: Address,
  pool: Address,
  firstTicketId: bigint,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_BATCH), addressBytes(pool), u64LeBytes(firstTicketId)],
  });
  return [pda, bump];
}

export async function findRedeemedCodePda(
  programId: Address,
  pool: Address,
  codeHash: Uint8Array,
): Promise<[Address, number]> {
  if (codeHash.length !== 32) {
    throw new Error(
      `findRedeemedCodePda: codeHash must be 32 bytes, got ${codeHash.length}`,
    );
  }
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_REDEEM), addressBytes(pool), codeHash],
  });
  return [pda, bump];
}

export async function findWhitelistedPda(
  programId: Address,
  pool: Address,
  wallet: Address,
): Promise<[Address, number]> {
  const { 0: pda, 1: bump } = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8(SEED_WHITELISTED), addressBytes(pool), addressBytes(wallet)],
  });
  return [pda, bump];
}

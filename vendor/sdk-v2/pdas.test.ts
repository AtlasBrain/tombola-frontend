// Cross-check our @solana/kit PDA derivation against @solana/web3.js v1's
// findProgramAddressSync (the long-tested reference). If both agree on every
// PDA in state.rs, our seed assembly is correct.

import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { address as toAddr } from "@solana/kit";

import {
  PROGRAM_ID,
  findConfigPda,
  findCounterPda,
  findPublicPoolPda,
  findPrivatePoolPda,
  findTicketBatchPda,
  findRedeemedCodePda,
  findWhitelistedPda,
} from "./pdas.js";

const programIdAddr = toAddr(PROGRAM_ID);
const programIdPub = new PublicKey(PROGRAM_ID);

const u64Le = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
};

// Reference derivations using web3.js v1 — well-tested upstream impl.
const refConfig = (): string =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programIdPub,
  )[0].toBase58();
const refCounter = (poolType: number): string =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), Buffer.from([poolType])],
    programIdPub,
  )[0].toBase58();
const refPublicPool = (poolType: number, round: bigint): string =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("public_pool"), Buffer.from([poolType]), u64Le(round)],
    programIdPub,
  )[0].toBase58();
const refPrivatePool = (creator: string, poolId: bigint): string =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("private_pool"),
      new PublicKey(creator).toBuffer(),
      u64Le(poolId),
    ],
    programIdPub,
  )[0].toBase58();
const refTicketBatch = (pool: string, firstTicketId: bigint): string =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("batch"),
      new PublicKey(pool).toBuffer(),
      u64Le(firstTicketId),
    ],
    programIdPub,
  )[0].toBase58();
const refRedeemed = (pool: string, codeHash: Uint8Array): string =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("redeem"),
      new PublicKey(pool).toBuffer(),
      Buffer.from(codeHash),
    ],
    programIdPub,
  )[0].toBase58();
const refWhitelisted = (pool: string, wallet: string): string =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("whitelisted"),
      new PublicKey(pool).toBuffer(),
      new PublicKey(wallet).toBuffer(),
    ],
    programIdPub,
  )[0].toBase58();

// Some stable test addresses (deterministic — hand-picked valid base58 keys).
const A = "11111111111111111111111111111112";
const B = "BPFLoaderUpgradeab1e11111111111111111111111";
const POOL = "AVbducCFnioqM8j8S6DVe6xK3DS79Bf7ciVVv8d37XLQ";

describe("pdas: cross-check with @solana/web3.js v1", () => {
  it("findConfigPda matches reference", async () => {
    const [pda] = await findConfigPda(programIdAddr);
    expect(pda).toBe(refConfig());
  });

  it("findCounterPda matches reference for pool_type 0..3", async () => {
    for (const t of [0, 1, 2, 3]) {
      const [pda] = await findCounterPda(programIdAddr, t);
      expect(pda).toBe(refCounter(t));
    }
  });

  it("findPublicPoolPda matches reference across (poolType, round)", async () => {
    for (const t of [0, 3]) {
      for (const r of [
        1n,
        7n,
        1234n,
        18446744073709551614n /* near u64 max */,
      ]) {
        const [pda] = await findPublicPoolPda(programIdAddr, t, r);
        expect(pda).toBe(refPublicPool(t, r));
      }
    }
  });

  it("findPrivatePoolPda matches reference", async () => {
    const [pda] = await findPrivatePoolPda(programIdAddr, toAddr(A), 42n);
    expect(pda).toBe(refPrivatePool(A, 42n));
  });

  it("findTicketBatchPda matches reference for first_ticket_id 0/1/...", async () => {
    for (const id of [0n, 1n, 1000n, 9999n]) {
      const [pda] = await findTicketBatchPda(programIdAddr, toAddr(POOL), id);
      expect(pda).toBe(refTicketBatch(POOL, id));
    }
  });

  it("findRedeemedCodePda matches reference for arbitrary 32-byte hash", async () => {
    const codeHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) codeHash[i] = (i * 17) & 0xff;
    const [pda] = await findRedeemedCodePda(
      programIdAddr,
      toAddr(POOL),
      codeHash,
    );
    expect(pda).toBe(refRedeemed(POOL, codeHash));
  });

  it("findWhitelistedPda matches reference", async () => {
    const [pda] = await findWhitelistedPda(
      programIdAddr,
      toAddr(POOL),
      toAddr(B),
    );
    expect(pda).toBe(refWhitelisted(POOL, B));
  });

  it("rejects non-32-byte code hash", async () => {
    await expect(
      findRedeemedCodePda(programIdAddr, toAddr(POOL), new Uint8Array(31)),
    ).rejects.toThrow();
  });

  it("rejects pool_type outside 0..255", async () => {
    await expect(findCounterPda(programIdAddr, -1)).rejects.toThrow();
    await expect(findCounterPda(programIdAddr, 256)).rejects.toThrow();
    await expect(findCounterPda(programIdAddr, 1.5)).rejects.toThrow();
  });
});

describe("pdas: PROGRAM_ID is the deployed raffle ID", () => {
  it("equals the address declared in Anchor.toml", () => {
    expect(PROGRAM_ID).toBe("AVbducCFnioqM8j8S6DVe6xK3DS79Bf7ciVVv8d37XLQ");
  });
});

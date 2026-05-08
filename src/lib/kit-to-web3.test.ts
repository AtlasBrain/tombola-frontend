import { describe, it, expect } from "vitest";
import type { Instruction } from "@solana/kit";
import { kitToWeb3 } from "./kit-to-web3";

const PROGRAM = "qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M";
const ACC1 = "EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt";
const ACC2 = "HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW";

// Build a minimal kit Instruction shape; only the fields kitToWeb3 reads.
function ix(role: number, address = ACC1): Instruction {
  return {
    programAddress: PROGRAM,
    accounts: [{ address, role }],
    data: new Uint8Array([0xde, 0xad]),
  } as unknown as Instruction;
}

describe("kitToWeb3 (kit AccountRole bit-mapping)", () => {
  it("role 0 (Readonly) → isSigner=false, isWritable=false", () => {
    const out = kitToWeb3(ix(0));
    expect(out.keys[0].isSigner).toBe(false);
    expect(out.keys[0].isWritable).toBe(false);
  });

  it("role 1 (Writable) → isSigner=false, isWritable=true", () => {
    const out = kitToWeb3(ix(1));
    expect(out.keys[0].isSigner).toBe(false);
    expect(out.keys[0].isWritable).toBe(true);
  });

  it("role 2 (ReadonlySigner) → isSigner=true, isWritable=false", () => {
    const out = kitToWeb3(ix(2));
    expect(out.keys[0].isSigner).toBe(true);
    expect(out.keys[0].isWritable).toBe(false);
  });

  it("role 3 (WritableSigner) → isSigner=true, isWritable=true", () => {
    const out = kitToWeb3(ix(3));
    expect(out.keys[0].isSigner).toBe(true);
    expect(out.keys[0].isWritable).toBe(true);
  });
});

describe("kitToWeb3 (passthrough)", () => {
  it("preserves programId and account address as PublicKeys", () => {
    const out = kitToWeb3(ix(1, ACC2));
    expect(out.programId.toBase58()).toBe(PROGRAM);
    expect(out.keys[0].pubkey.toBase58()).toBe(ACC2);
  });

  it("copies instruction data verbatim into a Buffer", () => {
    const out = kitToWeb3(ix(1));
    expect([...out.data]).toEqual([0xde, 0xad]);
  });

  it("handles multiple accounts", () => {
    const multi = {
      programAddress: PROGRAM,
      accounts: [
        { address: ACC1, role: 3 }, // WritableSigner
        { address: ACC2, role: 0 }, // Readonly
      ],
      data: new Uint8Array(),
    } as unknown as Instruction;

    const out = kitToWeb3(multi);
    expect(out.keys).toHaveLength(2);
    expect(out.keys[0]).toMatchObject({ isSigner: true, isWritable: true });
    expect(out.keys[1]).toMatchObject({ isSigner: false, isWritable: false });
  });

  it("tolerates an empty data field via the nullish-default branch", () => {
    const empty = {
      programAddress: PROGRAM,
      accounts: [{ address: ACC1, role: 0 }],
      // data intentionally omitted
    } as unknown as Instruction;
    expect(() => kitToWeb3(empty)).not.toThrow();
  });
});

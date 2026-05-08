"use client";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Instruction } from "@solana/kit";

// AccountRole bit layout (from @solana/instructions):
//   bit 0 = WRITABLE  (mask 0b01 = 1)
//   bit 1 = SIGNER    (mask 0b10 = 2)
// → values: 0=Readonly, 1=Writable, 2=ReadonlySigner, 3=WritableSigner
export function kitToWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: ((a.role as number) & 0b10) !== 0,
      isWritable: ((a.role as number) & 0b01) !== 0,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

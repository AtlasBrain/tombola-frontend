// Server-only: Kit Instruction → web3.js TransactionInstruction bridge +
// a thin sendAndConfirm helper. Switchboard's SDK returns web3.js ixs
// directly; our raffle SDK returns Kit ixs; this glues them.

import "server-only";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Instruction } from "@solana/kit";

/** AccountRole bit layout: bit 0 = WRITABLE, bit 1 = SIGNER (per @solana/kit). */
export function kitIxToWeb3(ix: Instruction): TransactionInstruction {
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

export async function sendAndConfirm(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  if (signers.length === 0) {
    throw new Error("sendAndConfirm requires at least one signer");
  }
  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  tx.feePayer = signers[0].publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  return sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
}

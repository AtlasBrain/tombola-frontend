// Bundle Jupiter swap instructions + buy_ticket_public_mode instruction into
// a single VersionedTransaction (V0 message with ALT support).
//
// Flow:
//   1. Convert raw Jupiter RawIx structs → web3.js TransactionInstruction
//   2. Fetch Jupiter-supplied Address Lookup Table accounts from chain
//   3. Compose: [computeBudget ixs] + [setup ixs] + [swap ix] + [cleanup ix?] + [buyTicketPublicMode ix]
//   4. Compile to V0Message + return VersionedTransaction (unsigned)

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import type { RawIx, SwapInstructionsResponse } from "./jupiter-swap.js";

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a Jupiter `RawIx` (plain JSON from the API) to a web3.js
 * `TransactionInstruction` that can be compiled into a V0 message.
 */
export function rawIxToWeb3(raw: RawIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(raw.data, "base64"),
  });
}

// ─── Bundle builder ───────────────────────────────────────────────────────────

export interface BuildBundleInput {
  connection: Connection;
  payer: PublicKey;
  /** Raw instructions returned by getSwapInstructions() */
  swapInstructions: SwapInstructionsResponse;
  /**
   * The buy_ticket_public_mode instruction (already built by the caller via
   * RaffleClient.buyTicketPublicMode and converted to web3.js format).
   */
  buyInstruction: TransactionInstruction;
}

/**
 * Builds an *unsigned* VersionedTransaction containing:
 *
 *   [computeBudget ixs] + [setup ixs] + [swap ix] + [cleanup ix?] + [buyTicketPublicMode]
 *
 * Uses Jupiter's recommended Address Lookup Tables to keep the transaction
 * under Solana's 1232-byte size limit. The caller must sign + submit.
 */
export async function buildSwapAndBuyTx({
  connection,
  payer,
  swapInstructions,
  buyInstruction,
}: BuildBundleInput): Promise<VersionedTransaction> {
  // Assemble instructions in canonical order
  const allIxs: TransactionInstruction[] = [];

  for (const ix of swapInstructions.computeBudgetInstructions) {
    allIxs.push(rawIxToWeb3(ix));
  }
  for (const ix of swapInstructions.setupInstructions) {
    allIxs.push(rawIxToWeb3(ix));
  }
  allIxs.push(rawIxToWeb3(swapInstructions.swapInstruction));
  if (swapInstructions.cleanupInstruction) {
    allIxs.push(rawIxToWeb3(swapInstructions.cleanupInstruction));
  }
  // buy_ticket_public_mode MUST be last so Jupiter's wrapping/unwrapping
  // completes before we call into the raffle program.
  allIxs.push(buyInstruction);

  // Fetch ALTs Jupiter recommended (reduces static account list size)
  const altKeys = swapInstructions.addressLookupTableAddresses.map(
    (s) => new PublicKey(s),
  );
  const altAccounts: AddressLookupTableAccount[] = [];
  for (const key of altKeys) {
    const info = await connection.getAddressLookupTable(key);
    if (info.value) altAccounts.push(info.value);
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: allIxs,
  }).compileToV0Message(altAccounts);

  return new VersionedTransaction(messageV0);
}

// Switchboard On-Demand boundary (D-058).
//
// The official @switchboard-xyz/on-demand SDK is web3.js v1 based: it expects
// `web3.js` `PublicKey`, `Connection`, and `TransactionInstruction` objects.
// This module is the single place those types are allowed to live; everywhere
// else in the SDK uses Kit's `Address` etc.
//
// Consumers of this module (the smoke test, advanced integrations) compose
// the returned web3.js instructions into a Kit transaction message via the
// helpers below.

import {
  Connection,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  Randomness,
  Queue,
  ON_DEMAND_DEVNET_QUEUE,
  ON_DEMAND_MAINNET_QUEUE,
} from "@switchboard-xyz/on-demand";

import {
  type Address,
  address as toAddress,
  type Instruction,
  type AccountMeta,
  AccountRole,
} from "@solana/kit";

export type SbCluster = "devnet" | "mainnet";

/** The official On-Demand queue address for the chosen cluster. */
export function switchboardQueueAddress(cluster: SbCluster): PublicKey {
  return cluster === "devnet"
    ? ON_DEMAND_DEVNET_QUEUE
    : ON_DEMAND_MAINNET_QUEUE;
}

/** Convert a Kit Address to a web3.js PublicKey for use with Switchboard. */
export function addressToPublicKey(addr: Address): PublicKey {
  return new PublicKey(addr);
}

/** Convert a web3.js PublicKey to a Kit Address. */
export function publicKeyToAddress(pk: PublicKey): Address {
  return toAddress(pk.toBase58());
}

/** Convert a web3.js TransactionInstruction into a Kit Instruction. */
export function web3InstructionToKit(ix: TransactionInstruction): Instruction {
  const accounts: AccountMeta[] = ix.keys.map((k) => ({
    address: publicKeyToAddress(k.pubkey),
    role: roleFromKey(k.isSigner, k.isWritable),
  }));
  return {
    programAddress: publicKeyToAddress(ix.programId),
    accounts,
    data: new Uint8Array(ix.data),
  };
}

function roleFromKey(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner && isWritable) return AccountRole.WRITABLE_SIGNER;
  if (isSigner) return AccountRole.READONLY_SIGNER;
  if (isWritable) return AccountRole.WRITABLE;
  return AccountRole.READONLY;
}

export { Connection, Randomness, Queue, PublicKey };

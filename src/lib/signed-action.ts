// Generic "wallet signs an action message, server verifies + consumes
// nonce" helper. Friend-store has its own copy of this shape inlined;
// pool-invite reuses this version. Pulling the friend-store version
// over is a follow-up — the two should converge on this one.
//
// Returns null on success, an error string otherwise. Callers MAP that
// string to a 401 response.

import nacl from "tweetnacl";
import { decodeBase58 } from "./base58";
import { consumeNonce } from "./profile-store";

export interface VerifySignedActionArgs {
  /** Caller's wallet pubkey, base58. */
  wallet: string;
  /** Exact bytes the wallet signed — caller is responsible for building
   *  the canonical message string (e.g. `tombola:pool-invite:create:<pool>:<friend>:<nonce>`)
   *  and passing its UTF-8 encoding here. */
  messageBytes: Uint8Array;
  /** ed25519 signature, base58. */
  signatureBase58: string;
  /** Server-issued nonce embedded in the message. Consumed on success. */
  nonce: string;
}

export async function verifySignedAction(
  args: VerifySignedActionArgs,
): Promise<string | null> {
  const { wallet, messageBytes, signatureBase58, nonce } = args;

  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return "Invalid wallet pubkey.";
  }
  if (typeof nonce !== "string" || nonce.length !== 64) {
    return "Invalid nonce.";
  }

  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = decodeBase58(wallet);
    sigBytes = decodeBase58(signatureBase58);
  } catch {
    return "Invalid base58 in wallet or signature.";
  }
  if (pubkeyBytes.length !== 32) return "Wallet pubkey must be 32 bytes.";
  if (sigBytes.length !== 64) return "Signature must be 64 bytes.";

  if (!nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes)) {
    return "Signature does not match wallet pubkey.";
  }

  const consumed = await consumeNonce(wallet, nonce);
  if (!consumed) return "Nonce expired or already used.";
  return null;
}

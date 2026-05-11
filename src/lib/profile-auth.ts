// Server-side wallet-signature auth for /api/profile/* mutations.
//
// Flow:
//   1. Client GETs /api/profile/nonce/[wallet] — server returns a fresh
//      random nonce, stored in KV with a 5-min TTL.
//   2. Client asks the wallet to signMessage("tombola:profile-edit:" + nonce).
//   3. Client POSTs the edit + the signature.
//   4. This module re-derives the expected message, verifies the signature
//      against the claimed wallet's public key, and (one-shot) consumes the
//      nonce so the signature can't be replayed.

import nacl from "tweetnacl";
import bs58 from "bs58";
import { consumeNonce } from "./profile-store";

const MESSAGE_PREFIX = "tombola:profile-edit:";

export interface SignedRequest {
  wallet: string;
  nonce: string;
  signatureBase58: string;
}

/** Build the exact message the client should ask the wallet to sign. Keep
 *  this in sync with the client-side `signProfileEdit` helper. */
export function messageFor(nonce: string): string {
  return `${MESSAGE_PREFIX}${nonce}`;
}

/** Verify a wallet signature over the server-issued nonce. On success the
 *  nonce is consumed (single-use). Returns null on success, an error string
 *  otherwise. */
export async function verifySignedRequest(
  req: SignedRequest,
): Promise<string | null> {
  const { wallet, nonce, signatureBase58 } = req;
  if (typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    return "Invalid wallet pubkey.";
  }
  if (typeof nonce !== "string" || nonce.length !== 64) {
    return "Invalid nonce.";
  }
  let pubkeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubkeyBytes = bs58Decode(wallet);
    sigBytes = bs58Decode(signatureBase58);
  } catch {
    return "Invalid base58 in wallet or signature.";
  }
  if (pubkeyBytes.length !== 32) return "Wallet pubkey must be 32 bytes.";
  if (sigBytes.length !== 64) return "Signature must be 64 bytes.";

  const message = new TextEncoder().encode(messageFor(nonce));
  const ok = nacl.sign.detached.verify(message, sigBytes, pubkeyBytes);
  if (!ok) return "Signature does not match wallet pubkey.";

  // Consume after verification so a malformed-but-signed request can't burn
  // someone else's nonce on the way through.
  const consumed = await consumeNonce(wallet, nonce);
  if (!consumed) return "Nonce expired or already used.";

  return null;
}

function bs58Decode(s: string): Uint8Array {
  // Wraps bs58 to normalize the import shape (default export or named).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = bs58 as any;
  const decode = (lib.default?.decode ?? lib.decode) as (s: string) => Uint8Array;
  return decode(s);
}

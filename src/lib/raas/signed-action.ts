// RaaS-specific signed-action helper.
//
// Context: src/lib/signed-action.ts (v1) has a different API surface —
// it takes pre-built messageBytes + signatureBase58 and returns string|null,
// and uses a wallet-scoped nonce store in profile-store. The RaaS routes need
// a boolean-returning helper that takes (wallet, nonce, signature, context)
// and verifies the message "tombola:{context}:{nonce}". Separate impl to avoid
// coupling the v1 nonce store to RaaS KV keys.
import "server-only";
import { Redis } from "@upstash/redis";
import nacl from "tweetnacl";
import bs58 from "bs58";

const redis = Redis.fromEnv();
const NONCE_KEY = (n: string) => `raas:nonce:${n}`;

export async function verifySignedAction(args: {
  wallet: string;
  nonce: string;
  signature: string;
  context: string;
}): Promise<boolean> {
  const stored = await redis.get<string>(NONCE_KEY(args.nonce));
  if (stored !== args.context) return false;
  await redis.del(NONCE_KEY(args.nonce)); // single-use

  const message = new TextEncoder().encode(`tombola:${args.context}:${args.nonce}`);
  let sig: Uint8Array;
  let pubkey: Uint8Array;
  try {
    sig = bs58.decode(args.signature);
    pubkey = bs58.decode(args.wallet);
  } catch {
    return false;
  }
  return nacl.sign.detached.verify(message, sig, pubkey);
}

export async function issueNonce(context: string): Promise<string> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
  await redis.set(NONCE_KEY(nonce), context, { ex: 300 }); // 5min TTL
  return nonce;
}

// Encode/decode self-contained redemption-link URL params for private pools.
//
// Format (spec §"Redemption link format"):
//   /redeem?p=<base58_pool>&c=<hex_code>&pr=<base64url_proof>&m=W|O
//
// `pr` is base64url-encoded concatenation of 32-byte sibling hashes. Empty
// proof (single-leaf tree) round-trips as `pr=` (empty value).

export type RedemptionMode = "Whitelist" | "OneCodePerTicket";

export interface RedemptionLinkParams {
  pool: string; // base58 pool pubkey
  code: string; // hex-encoded invite code
  proof: Uint8Array[]; // each element is exactly 32 bytes
  mode: RedemptionMode;
}

export interface EncodeArgs extends RedemptionLinkParams {
  origin: string; // e.g. "https://tombola-frontend-gamma.vercel.app"
}

const PROOF_BYTES_PER_LEVEL = 32;
const MODE_TO_SHORT: Record<RedemptionMode, "W" | "O"> = {
  Whitelist: "W",
  OneCodePerTicket: "O",
};
const SHORT_TO_MODE: Record<string, RedemptionMode> = {
  W: "Whitelist",
  O: "OneCodePerTicket",
};

export function encodeRedemptionLink(args: EncodeArgs): URL {
  const concat = new Uint8Array(args.proof.length * PROOF_BYTES_PER_LEVEL);
  for (let i = 0; i < args.proof.length; i++) {
    if (args.proof[i].length !== PROOF_BYTES_PER_LEVEL) {
      throw new Error(
        `encodeRedemptionLink: proof[${i}] must be 32 bytes, got ${args.proof[i].length}`,
      );
    }
    concat.set(args.proof[i], i * PROOF_BYTES_PER_LEVEL);
  }
  const proofB64Url = bytesToBase64Url(concat);
  const url = new URL("/redeem", args.origin);
  url.searchParams.set("p", args.pool);
  url.searchParams.set("c", args.code);
  url.searchParams.set("pr", proofB64Url);
  url.searchParams.set("m", MODE_TO_SHORT[args.mode]);
  return url;
}

export function decodeRedemptionLink(url: URL): RedemptionLinkParams {
  const pool = url.searchParams.get("p");
  const code = url.searchParams.get("c");
  const prRaw = url.searchParams.get("pr");
  const mShort = url.searchParams.get("m");
  if (!pool || !code || prRaw === null || !mShort) {
    throw new Error("decodeRedemptionLink: missing required params (p, c, pr, m)");
  }
  const mode = SHORT_TO_MODE[mShort];
  if (!mode) throw new Error(`decodeRedemptionLink: invalid mode '${mShort}'`);

  let concat: Uint8Array;
  try {
    concat = base64UrlToBytes(prRaw);
  } catch {
    throw new Error("decodeRedemptionLink: malformed proof base64");
  }
  if (concat.length % PROOF_BYTES_PER_LEVEL !== 0) {
    throw new Error(
      `decodeRedemptionLink: proof length ${concat.length} is not a multiple of 32`,
    );
  }
  const proof: Uint8Array[] = [];
  for (let i = 0; i < concat.length; i += PROOF_BYTES_PER_LEVEL) {
    proof.push(concat.slice(i, i + PROOF_BYTES_PER_LEVEL));
  }
  return { pool, code, proof, mode };
}

// ---------- base64url helpers (browser-compatible, no Buffer) ----------

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa is global in browsers + happy-dom; falls back to Buffer in Node SSR
  const b64 = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
  // base64url: '+' → '-', '/' → '_', strip padding
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  // Reverse base64url → standard base64 (re-pad if needed)
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// ---------- my-pools query helper ----------

import {
  type Address,
  createSolanaRpc,
  getAddressEncoder,
} from "@solana/kit";

// 8 disc + 208 fields = 216. Verified against live devnet PrivatePool
// FChacWqQR77V9h9sGnTbDkoiJMugTfg7qRaPzSkKWWe4 (size 216). If a future
// on-chain change adds a field, regenerate via:
//   `console.log((await getAccountInfo(somePool)).value.data.length)`.
const PRIVATE_POOL_DATA_SIZE = 216;

/**
 * Returns all PrivatePool PDAs whose creator field matches `walletAddress`.
 * Uses getProgramAccounts with a memcmp filter at offset 8 (skip discriminator)
 * for the 32-byte creator pubkey.
 */
export async function findMyPrivatePools(args: {
  rpcUrl: string;
  programId: string;
  walletAddress: string;
}): Promise<Array<{ address: Address }>> {
  const rpc = createSolanaRpc(args.rpcUrl);
  const creatorBytes = new Uint8Array(getAddressEncoder().encode(args.walletAddress as Address));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = ((await (rpc as any)
    .getProgramAccounts(args.programId as Address, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        { dataSize: BigInt(PRIVATE_POOL_DATA_SIZE) },
        {
          memcmp: {
            offset: 8n,
            bytes: addressToBase58(creatorBytes),
          },
        },
      ],
    })
    .send()) as unknown) as ReadonlyArray<{
    pubkey: Address;
    account: { data: [string, string]; owner: Address };
  }>;
  return result.map((r) => ({ address: r.pubkey }));
}

function addressToBase58(bytes: Uint8Array): string {
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = "";
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

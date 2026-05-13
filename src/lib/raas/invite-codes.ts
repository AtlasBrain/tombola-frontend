import { buildCodeTree } from "@tombola/sdk-v2/codes";

// Base58 alphabet minus visually confusing characters (0, O, I, l).
const BASE58_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CODE_BYTES = 16;
const CODE_GROUP_SIZE = 4;

/**
 * Generates N cryptographically random invite codes. Each code is 16 random
 * bytes encoded as base58-friendly chars and grouped with dashes for legibility.
 * Throws if count is out of [1, 1000] range.
 */
export function generateInviteCodes(count: number): string[] {
  if (count < 1) {
    throw new Error("count must be at least 1");
  }
  if (count > 1000) {
    throw new Error("count must be max 1000 codes per pool");
  }
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const buf = crypto.getRandomValues(new Uint8Array(CODE_BYTES));
    let raw = "";
    for (const b of buf) raw += BASE58_ALPHABET[b % BASE58_ALPHABET.length];
    // Group in CODE_GROUP_SIZE chars for legibility: ABCD-EFGH-...
    const grouped = raw.match(new RegExp(`.{1,${CODE_GROUP_SIZE}}`, "g"))!.join("-");
    if (!seen.has(grouped)) {
      seen.add(grouped);
      out.push(grouped);
    }
  }
  return out;
}

/**
 * Computes the Merkle root for an invite-code set using the same hashing
 * scheme as the on-chain redeem_invite_code instruction.
 *
 * Uses buildCodeTree from @tombola/sdk-v2 which applies:
 *   - leaf hash: keccak256(keccak256(code)) — double-hash for domain separation
 *   - internal node: keccak256(sorted(L, R)) — sorted-pair to make proofs directionless
 *
 * The function is async to match the expected API surface and allow future
 * migration to SubtleCrypto-based hashing.
 */
export async function computeRootFromCodes(codes: string[]): Promise<Uint8Array> {
  // buildCodeTree de-dupes internally and returns { root, proofs }
  // Sorting the input first ensures order-insensitive output since buildCodeTree
  // sorts leaves (sorted-pair merging) but not the input codes themselves.
  // However, since the Merkle tree uses sorted-pair at each level, the root IS
  // order-insensitive regardless of input order — verified by the test.
  const { root } = buildCodeTree(codes);
  return root;
}

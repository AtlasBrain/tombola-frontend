// TS mirror of programs/raffle/src/merkle.rs (D-046, D-047, D-048).
//
// Scheme:
//   - Hash function: keccak256 (FIPS 202).
//   - Leaf hash: hashLeaf(code) = keccak256(keccak256(code)). Double-hashing
//     domain-separates leaf hashes (always keccak(32 bytes)) from internal
//     node hashes (always keccak(64 bytes)), preventing second-preimage forgery.
//   - Internal node: keccak256(min(L,R) || max(L,R)) — sorted-pair, so proofs
//     don't need to encode left/right direction.

import sha3 from "js-sha3";
const { keccak_256 } = sha3;

const HASH_LEN = 32;

const toBytes = (input: Uint8Array | string): Uint8Array =>
  typeof input === "string" ? new TextEncoder().encode(input) : input;

const keccak = (data: Uint8Array): Uint8Array =>
  new Uint8Array(keccak_256.arrayBuffer(data));

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const compareLE = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
};

const hashPairSorted = (a: Uint8Array, b: Uint8Array): Uint8Array =>
  compareLE(a, b) <= 0 ? keccak(concat(a, b)) : keccak(concat(b, a));

export function hashLeaf(code: Uint8Array | string): Uint8Array {
  const inner = keccak(toBytes(code));
  return keccak(inner);
}

export function buildTree(leaves: Uint8Array[]): {
  root: Uint8Array;
  layers: Uint8Array[][];
} {
  if (leaves.length === 0) {
    throw new Error("buildTree: leaves must be non-empty");
  }
  for (const l of leaves) {
    if (l.length !== HASH_LEN) {
      throw new Error(`buildTree: every leaf must be ${HASH_LEN} bytes`);
    }
  }

  const layers: Uint8Array[][] = [leaves.map((l) => new Uint8Array(l))];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Uint8Array[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(hashPairSorted(prev[i], prev[i + 1]));
      } else {
        // Odd leaf out: promote unchanged. Mirrors Rust build_tree's odd-leaf branch.
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }

  return { root: layers[layers.length - 1][0], layers };
}

export function proofFor(
  layers: Uint8Array[][],
  leafIndex: number,
): Uint8Array[] {
  if (layers.length === 0) throw new Error("proofFor: empty layers");
  if (leafIndex < 0 || leafIndex >= layers[0].length) {
    throw new Error(`proofFor: leafIndex ${leafIndex} out of range`);
  }
  const proof: Uint8Array[] = [];
  let index = leafIndex;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l];
    const siblingIdx = index ^ 1;
    if (siblingIdx < layer.length) {
      proof.push(layer[siblingIdx]);
    }
    // Odd-leaf-out has no sibling, no proof step at this layer.
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyProof(
  leaf: Uint8Array,
  proof: Uint8Array[],
  root: Uint8Array,
): boolean {
  if (leaf.length !== HASH_LEN || root.length !== HASH_LEN) return false;
  let current = leaf;
  for (const sibling of proof) {
    if (sibling.length !== HASH_LEN) return false;
    current = hashPairSorted(current, sibling);
  }
  return constantTimeEq(current, root);
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

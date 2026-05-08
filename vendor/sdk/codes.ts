// Invite-code helpers: generate, encode, hash, and build the merkle tree
// of leaf-hashes the on-chain program will verify proofs against.
//
// Code format: lower-case hex of N random bytes (default 16 → 32 chars).
// Hex was chosen for human-typeability (no ambiguous chars) and zero
// dependencies. Hashing matches programs/raffle/src/merkle.rs::hash_leaf
// (D-053): the on-chain seed expression also calls hash_leaf, so codes are
// passed in their human-readable string form to redeem_invite_code_*.

import { hashLeaf, buildTree, proofFor } from "./merkle.js";

// Web Crypto is global in Node 20+ and the browser; works without node: imports.
function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

export const DEFAULT_CODE_BYTE_LEN = 16;

const HEX_CHARS = "0123456789abcdef";

const toHex = (b: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < b.length; i++) {
    const v = b[i];
    out += HEX_CHARS[v >>> 4] + HEX_CHARS[v & 0x0f];
  }
  return out;
};

export function generateInviteCode(
  byteLen: number = DEFAULT_CODE_BYTE_LEN,
): string {
  if (!Number.isInteger(byteLen) || byteLen <= 0) {
    throw new Error(
      `generateInviteCode: byteLen must be a positive integer, got ${byteLen}`,
    );
  }
  return toHex(randomBytes(byteLen));
}

export function encodeCode(code: string): Uint8Array {
  return new TextEncoder().encode(code);
}

export function hashCode(code: string | Uint8Array): Uint8Array {
  return hashLeaf(code);
}

export interface CodeTree {
  root: Uint8Array;
  proofs: Record<string, Uint8Array[]>;
}

export function buildCodeTree(codes: string[]): CodeTree {
  if (codes.length === 0) {
    throw new Error("buildCodeTree: codes must be non-empty");
  }
  // De-dupe to avoid two leaves at the same code (and to give a stable proofs map).
  const unique = Array.from(new Set(codes));
  const leaves = unique.map((c) => hashLeaf(c));
  const { root, layers } = buildTree(leaves);
  const proofs: Record<string, Uint8Array[]> = {};
  unique.forEach((code, i) => {
    proofs[code] = proofFor(layers, i);
  });
  return { root, proofs };
}

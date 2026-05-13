import { describe, it, expect } from "vitest";
import { keccak_256 } from "js-sha3";

import { hashLeaf, buildTree, proofFor, verifyProof } from "./merkle.js";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const hex = (b: Uint8Array): string =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const fromHex = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
};

describe("merkle: keccak256 algorithm choice (D-046)", () => {
  // FIPS-202 keccak256 gold vectors — locks "keccak256" not "sha3-256" or "sha-256".
  // Reference: https://emn178.github.io/online-tools/keccak_256.html
  it("keccak256('') matches the canonical empty-string digest", () => {
    expect(hex(new Uint8Array(keccak_256.arrayBuffer("")))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("keccak256('abc') matches the canonical 'abc' digest", () => {
    expect(hex(new Uint8Array(keccak_256.arrayBuffer("abc")))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });
});

describe("merkle.hashLeaf (D-047 double-hash)", () => {
  it("hashLeaf double-hashes the input (matches Rust merkle::hash_leaf)", () => {
    const code = utf8("hello-world");
    const inner = new Uint8Array(keccak_256.arrayBuffer(code));
    const outer = new Uint8Array(keccak_256.arrayBuffer(inner));
    expect(hex(hashLeaf(code))).toBe(hex(outer));
  });

  it("hashLeaf accepts string and equals the byte-array form", () => {
    expect(hex(hashLeaf("hello-world"))).toBe(
      hex(hashLeaf(utf8("hello-world"))),
    );
  });

  it("returns 32 bytes", () => {
    expect(hashLeaf("anything").length).toBe(32);
  });
});

describe("merkle.buildTree + verifyProof (parallels Rust merkle::tests)", () => {
  it("single-leaf tree's root equals the leaf hash; empty proof verifies", () => {
    const leaf = hashLeaf("only-code");
    const { root } = buildTree([leaf]);
    expect(hex(root)).toBe(hex(leaf));
    expect(verifyProof(leaf, [], root)).toBe(true);
  });

  it("two-leaf tree: each leaf verifies", () => {
    const a = hashLeaf("alpha");
    const b = hashLeaf("beta");
    const { root, layers } = buildTree([a, b]);

    expect(verifyProof(a, proofFor(layers, 0), root)).toBe(true);
    expect(verifyProof(b, proofFor(layers, 1), root)).toBe(true);
  });

  it("four-leaf tree: each leaf verifies", () => {
    const leaves = [0, 1, 2, 3].map((i) => hashLeaf(`code-${i}`));
    const { root, layers } = buildTree(leaves);

    leaves.forEach((leaf, i) => {
      expect(verifyProof(leaf, proofFor(layers, i), root)).toBe(true);
    });
  });

  it("seven-leaf tree (unbalanced): each leaf verifies (odd-leaf-out branch)", () => {
    const leaves = [0, 1, 2, 3, 4, 5, 6].map((i) => hashLeaf(`c${i}`));
    const { root, layers } = buildTree(leaves);

    leaves.forEach((leaf, i) => {
      expect(verifyProof(leaf, proofFor(layers, i), root)).toBe(true);
    });
  });

  it("tampered leaf fails verification", () => {
    const real = hashLeaf("real-code");
    const other = hashLeaf("other-code");
    const { root, layers } = buildTree([real, other]);
    const proofReal = proofFor(layers, 0);

    const fake = hashLeaf("fake-code");
    expect(verifyProof(fake, proofReal, root)).toBe(false);
  });

  it("tampered proof sibling fails verification", () => {
    const a = hashLeaf("alpha");
    const b = hashLeaf("beta");
    const c = hashLeaf("gamma");
    const d = hashLeaf("delta");
    const { root, layers } = buildTree([a, b, c, d]);

    const proofA = proofFor(layers, 0);
    proofA[0] = new Uint8Array(proofA[0]);
    proofA[0][0] ^= 0xff;
    expect(verifyProof(a, proofA, root)).toBe(false);
  });

  it("tampered root fails verification", () => {
    const a = hashLeaf("alpha");
    const b = hashLeaf("beta");
    const { root: realRoot, layers } = buildTree([a, b]);
    const proofA = proofFor(layers, 0);

    const fakeRoot = new Uint8Array(realRoot);
    fakeRoot[0] ^= 0xff;
    expect(verifyProof(a, proofA, fakeRoot)).toBe(false);
  });

  it("rejects empty leaf list", () => {
    expect(() => buildTree([])).toThrow();
  });
});

describe("merkle.verifyProof: sorted-pair invariant (D-047)", () => {
  it("uses sorted-pair hashing so order-independent proof structure", () => {
    // If we synthesize a proof where the sibling is bigger-than-leaf, the algorithm
    // must hash min(leaf, sibling) || max(leaf, sibling). This is the security
    // property that makes proofs not need to encode left/right direction.
    const leafA = fromHex("00".repeat(32));
    const sibling = fromHex("ff".repeat(32));
    // node = keccak256(leafA || sibling) — leafA < sibling so leaf comes first
    const expected = new Uint8Array(
      keccak_256.arrayBuffer(new Uint8Array([...leafA, ...sibling])),
    );
    // verify that leafA + [sibling] resolves to expected as the next layer's hash
    expect(verifyProof(leafA, [sibling], expected)).toBe(true);

    // And the reverse: if leaf is bigger than sibling, sibling comes first.
    const leafB = fromHex("ff".repeat(32));
    const sibling2 = fromHex("00".repeat(32));
    const expected2 = new Uint8Array(
      keccak_256.arrayBuffer(new Uint8Array([...sibling2, ...leafB])),
    );
    expect(verifyProof(leafB, [sibling2], expected2)).toBe(true);
  });
});

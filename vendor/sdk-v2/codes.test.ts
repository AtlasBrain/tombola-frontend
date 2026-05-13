import { describe, it, expect } from "vitest";

import {
  DEFAULT_CODE_BYTE_LEN,
  buildCodeTree,
  encodeCode,
  generateInviteCode,
  hashCode,
} from "./codes.js";
import { hashLeaf, verifyProof } from "./merkle.js";

const hex = (b: Uint8Array): string =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("codes.generateInviteCode", () => {
  it("produces a hex string of 2 * DEFAULT_CODE_BYTE_LEN by default", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9a-f]+$/);
    expect(code.length).toBe(2 * DEFAULT_CODE_BYTE_LEN);
  });

  it("respects an explicit byte length", () => {
    const code = generateInviteCode(8);
    expect(code.length).toBe(16);
  });

  it("rejects non-positive byte lengths", () => {
    expect(() => generateInviteCode(0)).toThrow();
    expect(() => generateInviteCode(-1)).toThrow();
  });

  it("produces distinct codes across calls (probabilistic)", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(50);
  });
});

describe("codes.encodeCode", () => {
  it("UTF-8 encodes the string", () => {
    expect(hex(encodeCode("abc"))).toBe("616263");
  });
});

describe("codes.hashCode", () => {
  it("matches merkle.hashLeaf (D-053 leaf-hash semantics)", () => {
    const c = "INVITE-XYZ-123";
    expect(hex(hashCode(c))).toBe(hex(hashLeaf(c)));
  });

  it("hashing bytes vs string with identical content yields identical leaf", () => {
    const code = "abc";
    expect(hex(hashCode(code))).toBe(hex(hashCode(encodeCode(code))));
  });
});

describe("codes.buildCodeTree", () => {
  it("rejects empty list", () => {
    expect(() => buildCodeTree([])).toThrow();
  });

  it("every code has a proof that verifies against the root", () => {
    const codes = ["a", "b", "c", "d", "e"];
    const tree = buildCodeTree(codes);
    for (const code of codes) {
      const proof = tree.proofs[code];
      expect(proof).toBeDefined();
      expect(verifyProof(hashCode(code), proof, tree.root)).toBe(true);
    }
  });

  it("dedupes duplicate codes (same proof, single entry)", () => {
    const tree = buildCodeTree(["x", "x", "y"]);
    expect(Object.keys(tree.proofs).sort()).toEqual(["x", "y"]);
    expect(verifyProof(hashCode("x"), tree.proofs["x"], tree.root)).toBe(true);
    expect(verifyProof(hashCode("y"), tree.proofs["y"], tree.root)).toBe(true);
  });

  it("a code not in the tree fails proof verification with any leaf's proof", () => {
    const tree = buildCodeTree(["a", "b", "c"]);
    const fakeLeaf = hashCode("not-in-tree");
    expect(verifyProof(fakeLeaf, tree.proofs["a"], tree.root)).toBe(false);
  });

  it("single-code tree: root equals leaf, empty proof verifies", () => {
    const tree = buildCodeTree(["only"]);
    expect(hex(tree.root)).toBe(hex(hashCode("only")));
    expect(tree.proofs["only"].length).toBe(0);
    expect(verifyProof(hashCode("only"), [], tree.root)).toBe(true);
  });
});

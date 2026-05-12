import { describe, it, expect } from "vitest";
import { encodeBase58, decodeBase58 } from "./base58";

// Single canonical base58 helper after consolidating 10 hand-rolled
// wrappers across the codebase. Smoke + roundtrip is enough — bs58
// itself is heavily tested upstream. We just need to ensure the CJS/ESM
// default-export shim (lib.default?.encode ?? lib.encode) didn't get
// the wrong function.

describe("encodeBase58 / decodeBase58", () => {
  it("roundtrips empty bytes", () => {
    const bytes = new Uint8Array(0);
    expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes);
  });

  it("roundtrips arbitrary bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 0xff, 0x00, 0x7f]);
    const encoded = encodeBase58(bytes);
    expect(typeof encoded).toBe("string");
    expect(decodeBase58(encoded)).toEqual(bytes);
  });

  it("roundtrips a 32-byte pubkey-shaped buffer", () => {
    // Solana pubkeys are 32 bytes; this is the hot path for memcmp
    // filter encoding. If the shim wires up the wrong direction we'd
    // see corruption here first.
    const bytes = new Uint8Array(32).map((_, i) => (i * 7 + 1) & 0xff);
    expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes);
  });

  it("encodes the known SystemProgram pubkey", () => {
    // SystemProgram = 32 zero bytes → base58 "11111111111111111111111111111111".
    const allZeros = new Uint8Array(32);
    expect(encodeBase58(allZeros)).toBe(
      "11111111111111111111111111111111",
    );
  });

  it("decodes the known SystemProgram pubkey back to 32 zero bytes", () => {
    const decoded = decodeBase58("11111111111111111111111111111111");
    expect(decoded).toEqual(new Uint8Array(32));
  });
});

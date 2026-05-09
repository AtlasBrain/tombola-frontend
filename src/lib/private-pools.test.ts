import { describe, it, expect } from "vitest";
import {
  encodeRedemptionLink,
  decodeRedemptionLink,
} from "./private-pools";

describe("encodeRedemptionLink / decodeRedemptionLink", () => {
  const POOL = "HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW";
  const CODE = "ab".repeat(16); // 32-char hex
  const PROOF = [
    new Uint8Array(32).fill(0x11),
    new Uint8Array(32).fill(0x22),
  ];

  it("round-trips Whitelist-mode params", () => {
    const url = encodeRedemptionLink({
      origin: "https://tombola.example",
      pool: POOL,
      code: CODE,
      proof: PROOF,
      mode: "Whitelist",
    });
    expect(url.pathname).toBe("/redeem");
    const decoded = decodeRedemptionLink(url);
    expect(decoded.pool).toBe(POOL);
    expect(decoded.code).toBe(CODE);
    expect(decoded.mode).toBe("Whitelist");
    expect(decoded.proof.length).toBe(2);
    expect(decoded.proof[0]).toEqual(PROOF[0]);
    expect(decoded.proof[1]).toEqual(PROOF[1]);
  });

  it("round-trips OneCodePerTicket-mode params", () => {
    const url = encodeRedemptionLink({
      origin: "https://tombola.example",
      pool: POOL,
      code: CODE,
      proof: PROOF,
      mode: "OneCodePerTicket",
    });
    const decoded = decodeRedemptionLink(url);
    expect(decoded.mode).toBe("OneCodePerTicket");
  });

  it("round-trips an empty proof (single-leaf tree)", () => {
    const url = encodeRedemptionLink({
      origin: "https://tombola.example",
      pool: POOL,
      code: CODE,
      proof: [],
      mode: "Whitelist",
    });
    const decoded = decodeRedemptionLink(url);
    expect(decoded.proof).toEqual([]);
  });

  it("decodeRedemptionLink throws on missing required params", () => {
    const url = new URL("https://tombola.example/redeem?p=abc");
    expect(() => decodeRedemptionLink(url)).toThrow(/missing/i);
  });

  it("decodeRedemptionLink throws on invalid mode", () => {
    const url = new URL(
      `https://tombola.example/redeem?p=${POOL}&c=${CODE}&pr=&m=X`,
    );
    expect(() => decodeRedemptionLink(url)).toThrow(/mode/i);
  });

  it("decodeRedemptionLink throws on malformed proof bytes", () => {
    const url = new URL(
      `https://tombola.example/redeem?p=${POOL}&c=${CODE}&pr=NOT-BASE64-!!!&m=W`,
    );
    expect(() => decodeRedemptionLink(url)).toThrow(/proof/i);
  });

  it("decodeRedemptionLink throws when proof is not a multiple of 32 bytes", () => {
    // Encode a single 31-byte chunk (invalid)
    const bad = btoa(String.fromCharCode(...new Uint8Array(31)));
    const url = new URL(
      `https://tombola.example/redeem?p=${POOL}&c=${CODE}&pr=${encodeURIComponent(bad)}&m=W`,
    );
    expect(() => decodeRedemptionLink(url)).toThrow(/proof/i);
  });

  it("encoded URL stays under 720 chars for a 13-deep proof", () => {
    const deepProof = Array.from(
      { length: 13 },
      (_, i) => new Uint8Array(32).fill(i + 1),
    );
    const url = encodeRedemptionLink({
      origin: "https://tombola-frontend-gamma.vercel.app",
      pool: POOL,
      code: CODE,
      proof: deepProof,
      mode: "OneCodePerTicket",
    });
    expect(url.toString().length).toBeLessThan(720);
  });
});

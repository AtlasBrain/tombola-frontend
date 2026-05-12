import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import {
  adminLoginMessage,
  signSession,
  verifySession,
  DEFAULT_TTL_SEC,
} from "./session";

const SECRET = "test-secret-32-bytes-or-more-please-padding";
const WALLET = "A9XZabcdefghijklmnopqrstuvwxyzCDWY12"; // 36 chars, valid shape

describe("admin session HMAC", () => {
  const original = process.env.ADMIN_SESSION_SECRET;
  beforeAll(() => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = original;
  });

  it("signs and verifies a fresh session", () => {
    const token = signSession(WALLET);
    const payload = verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.wallet).toBe(WALLET);
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("respects custom TTL", () => {
    const now = 1_700_000_000;
    const token = signSession(WALLET, { ttlSec: 60, nowSec: now });
    const payload = verifySession(token, { nowSec: now });
    expect(payload?.exp).toBe(now + 60);
  });

  it("defaults to 15-minute TTL", () => {
    expect(DEFAULT_TTL_SEC).toBe(15 * 60);
  });

  it("rejects an expired token", () => {
    const now = 1_700_000_000;
    const token = signSession(WALLET, { ttlSec: 60, nowSec: now });
    expect(verifySession(token, { nowSec: now + 61 })).toBeNull();
    expect(verifySession(token, { nowSec: now + 60 })).toBeNull(); // boundary
    expect(verifySession(token, { nowSec: now + 59 })).not.toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession(WALLET);
    process.env.ADMIN_SESSION_SECRET = "different-secret-32-bytes-or-more-here";
    expect(verifySession(token)).toBeNull();
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  it("rejects a token with a flipped signature byte", () => {
    const token = signSession(WALLET);
    const dot = token.indexOf(".");
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    // Flip a hex char in the middle.
    const flipped =
      sig.slice(0, 16) +
      (sig[16] === "0" ? "1" : "0") +
      sig.slice(17);
    expect(verifySession(`${payload}.${flipped}`)).toBeNull();
  });

  it("rejects a token with a tampered payload", () => {
    const token = signSession(WALLET);
    const sig = token.split(".")[1];
    // Swap to a different wallet — signature won't match.
    const fakePayload = Buffer.from(
      JSON.stringify({ wallet: "XXXX12345678901234567890123456789ATTACKER", exp: 9999999999 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(verifySession(`${fakePayload}.${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySession("")).toBeNull();
    expect(verifySession(null)).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("no-dot-here")).toBeNull();
    expect(verifySession(".justdot")).toBeNull();
    expect(verifySession("payload.")).toBeNull();
    expect(verifySession("payload.notvalidhex")).toBeNull();
  });

  it("rejects payloads with wrong shape", () => {
    const encoded = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    // Build a "valid" HMAC over a garbage payload to ensure shape gate
    // still rejects.
    const payload = encoded({ not: "a session" });
    const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifySession(`${payload}.${sig}`)).toBeNull();
  });

  it("rejects payloads with a malformed wallet", () => {
    const encoded = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    const now = Math.floor(Date.now() / 1000);
    const tooShort = encoded({ wallet: "tooshort", exp: now + 60 });
    const tooLong = encoded({
      wallet: "x".repeat(60),
      exp: now + 60,
    });
    const sig = (p: string) =>
      createHmac("sha256", SECRET).update(p).digest("hex");
    expect(verifySession(`${tooShort}.${sig(tooShort)}`)).toBeNull();
    expect(verifySession(`${tooLong}.${sig(tooLong)}`)).toBeNull();
  });

  it("throws when secret is missing or too short", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    expect(() => signSession(WALLET)).toThrow();
    process.env.ADMIN_SESSION_SECRET = "tooshort";
    expect(() => signSession(WALLET)).toThrow();
    process.env.ADMIN_SESSION_SECRET = SECRET;
  });

  it("login message is stable", () => {
    expect(adminLoginMessage("abc123")).toBe(
      "tombola:admin-session:abc123",
    );
  });
});

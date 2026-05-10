import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import { loadKeeperKeypair } from "../wallet.js";

describe("loadKeeperKeypair", () => {
  const original = process.env.KEEPER_KEYPAIR;

  afterEach(() => {
    if (original === undefined) delete process.env.KEEPER_KEYPAIR;
    else process.env.KEEPER_KEYPAIR = original;
  });

  it("throws when KEEPER_KEYPAIR is not set", () => {
    delete process.env.KEEPER_KEYPAIR;
    expect(() => loadKeeperKeypair()).toThrow("KEEPER_KEYPAIR env var is not set");
  });

  it("throws when KEEPER_KEYPAIR is not valid JSON", () => {
    process.env.KEEPER_KEYPAIR = "not-json";
    expect(() => loadKeeperKeypair()).toThrow("KEEPER_KEYPAIR is not valid JSON");
  });

  it("throws when KEEPER_KEYPAIR is not a 64-element array", () => {
    process.env.KEEPER_KEYPAIR = JSON.stringify([1, 2, 3]);
    expect(() => loadKeeperKeypair()).toThrow("must be a 64-element JSON array");
  });

  it("returns a Keypair when given a valid 64-byte secret key", () => {
    const validKeypair = Keypair.generate();
    const secretKeyArray = Array.from(validKeypair.secretKey);
    process.env.KEEPER_KEYPAIR = JSON.stringify(secretKeyArray);
    const kp = loadKeeperKeypair();
    expect(kp.secretKey).toHaveLength(64);
    expect(kp.publicKey.toBase58()).toBeTypeOf("string");
    // Verify it matches the original
    expect(kp.publicKey.toBase58()).toBe(validKeypair.publicKey.toBase58());
  });
});

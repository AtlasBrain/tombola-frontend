import { describe, it, expect } from "vitest";
import { encryptCodes, decryptCodes } from "./code-storage.js";

describe("encryptCodes / decryptCodes round trip", () => {
  it("encrypts a code list and decrypts it back", async () => {
    const codes = ["alpha-001", "beta-002", "gamma-003"];
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const exported = new Uint8Array(await crypto.subtle.exportKey("raw", key));

    const encrypted = await encryptCodes(codes, exported);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.iv.length).toBe(12); // AES-GCM standard IV length

    const decrypted = await decryptCodes(encrypted, exported);
    expect(decrypted).toEqual(codes);
  });

  it("decryption with wrong key throws", async () => {
    const codes = ["alpha"];
    const key1Exported = crypto.getRandomValues(new Uint8Array(32));
    const key2Exported = crypto.getRandomValues(new Uint8Array(32));

    const encrypted = await encryptCodes(codes, key1Exported);
    await expect(decryptCodes(encrypted, key2Exported)).rejects.toThrow();
  });

  it("decryption with tampered ciphertext throws", async () => {
    const codes = ["alpha"];
    const keyExported = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptCodes(codes, keyExported);
    const tampered = {
      ...encrypted,
      ciphertext: new Uint8Array(encrypted.ciphertext.length).fill(0),
    };
    await expect(decryptCodes(tampered, keyExported)).rejects.toThrow();
  });
});

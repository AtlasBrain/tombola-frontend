import "server-only";

export interface EncryptedCodeSet {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  count: number;
}

/** Copy a Uint8Array into a fresh ArrayBuffer (never SharedArrayBuffer) for SubtleCrypto. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptCodes(
  codes: string[],
  keyBytes: Uint8Array,
): Promise<EncryptedCodeSet> {
  const key = await importKey(keyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(codes));
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return {
    ciphertext: new Uint8Array(ctBuf),
    iv,
    count: codes.length,
  };
}

export async function decryptCodes(
  payload: EncryptedCodeSet,
  keyBytes: Uint8Array,
): Promise<string[]> {
  const key = await importKey(keyBytes);
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(payload.iv) },
    key,
    toArrayBuffer(payload.ciphertext),
  );
  const text = new TextDecoder().decode(ptBuf);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("decrypted payload is not an array");
  return parsed as string[];
}

/**
 * Generates a fresh AES-256 key (32 bytes). Stored per-tenant in KV.
 * Caller is responsible for KV writes.
 */
export function generateCodeKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

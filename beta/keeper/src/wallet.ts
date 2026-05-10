import { Keypair } from "@solana/web3.js";

export function loadKeeperKeypair(): Keypair {
  const raw = process.env.KEEPER_KEYPAIR;
  if (!raw) throw new Error("KEEPER_KEYPAIR env var is not set");
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error("KEEPER_KEYPAIR is not valid JSON");
  }
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(
      `KEEPER_KEYPAIR must be a 64-element JSON array, got ${Array.isArray(arr) ? `length ${arr.length}` : "non-array"}`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
}

// Single base58 codec used everywhere a Solana pubkey or signature needs to
// move between Uint8Array and string form.
//
// Why this wrapper exists: `bs58` ships its functions under either
// `bs58.default` (CJS / Node) or directly on the namespace (ESM bundles),
// depending on how the consumer is built. Resolving that once here keeps
// the rest of the codebase from copy-pasting the same `lib.default?.encode
// ?? lib.encode` workaround. Six files previously hand-rolled their own
// base58 implementations and another four wrapped the import shape —
// they all funnel through here now.

import bs58 from "bs58";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lib = bs58 as any;
const _encode = (lib.default?.encode ?? lib.encode) as (
  b: Uint8Array,
) => string;
const _decode = (lib.default?.decode ?? lib.decode) as (s: string) => Uint8Array;

/** Encode bytes to base58. Empty input returns "1" (matches Solana convention). */
export function encodeBase58(bytes: Uint8Array): string {
  return _encode(bytes);
}

/** Decode a base58 string to bytes. Throws on invalid input. */
export function decodeBase58(s: string): Uint8Array {
  return _decode(s);
}

import "server-only";

/**
 * Fetch the current SOL/USD spot. Cached in-process at 60 s.
 * Returns 0 on failure (caller falls back to SOL-only display).
 */
let _cache: { price: number; at: number } | null = null;
const TTL_MS = 60_000;

export async function getSolUsd(): Promise<number> {
  if (_cache && Date.now() - _cache.at < TTL_MS) {
    return _cache.price;
  }
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 60 } },
    );
    if (!r.ok) return 0;
    const body = (await r.json()) as { solana?: { usd?: number } };
    const price = body.solana?.usd ?? 0;
    _cache = { price, at: Date.now() };
    return price;
  } catch {
    return 0;
  }
}

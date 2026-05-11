// Single canonical Upstash Redis client.
//
// Lazy-init so build-time / lint-time importers don't crash on missing env
// vars. Returns null when Upstash isn't configured (local dev without env);
// callers must handle null gracefully — typically fall back to an empty
// result or a per-lambda in-memory map.
//
// We accept both naming conventions because Vercel's Upstash Marketplace
// integration injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (legacy KV
// branding), while a direct Upstash signup uses `UPSTASH_REDIS_REST_URL` /
// `UPSTASH_REDIS_REST_TOKEN`. Either pair works.

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis !== null) return redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export type { Redis };

// src/lib/raas/pool-attribution.ts — Pool→tenant attribution KV helpers.
import "server-only";
import { Redis } from "@upstash/redis";
import type { PoolAttribution } from "@/types/raas";

const redis = Redis.fromEnv();

const POOL_KEY = (pubkey: string) => `raas:pool:${pubkey}`;
const TENANT_POOLS_KEY = (slug: string) => `raas:tenant:${slug}:pools`;

export interface AttributePoolInput {
  pool_pubkey: string;
  tenant_slug: string;
  created_via: "manual";
}

export async function attributePool(input: AttributePoolInput): Promise<void> {
  const attribution: PoolAttribution = {
    tenant_slug: input.tenant_slug,
    created_at: new Date().toISOString(),
    created_via: input.created_via,
  };
  await redis.set(POOL_KEY(input.pool_pubkey), attribution);

  // Prepend to tenant's pool index (most-recent first).
  const existing =
    (await redis.get<string[]>(TENANT_POOLS_KEY(input.tenant_slug))) ?? [];
  if (!existing.includes(input.pool_pubkey)) {
    existing.unshift(input.pool_pubkey);
    await redis.set(TENANT_POOLS_KEY(input.tenant_slug), existing);
  }
}

export async function getPoolTenant(
  pool_pubkey: string,
): Promise<PoolAttribution | null> {
  return await redis.get<PoolAttribution>(POOL_KEY(pool_pubkey));
}

export async function listTenantPools(slug: string): Promise<string[]> {
  return (await redis.get<string[]>(TENANT_POOLS_KEY(slug))) ?? [];
}

// scripts/provision-tombola-tenant.mts
//
// Creates the official "tombola" tenant in KV so the v1 /create flow can
// redirect into the unified /r/tombola/create wizard. Run once.
//
// Run: tsx scripts/provision-tombola-tenant.mts
//
// Env required:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   TOMBOLA_OWNER_WALLET  — base58 wallet that receives creator fees for
//                           raffles created via the unified flow.

import { Redis } from "@upstash/redis";

const SLUG = "tombola";
const OWNER =
  process.env.TOMBOLA_OWNER_WALLET ??
  "EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt"; // v1 devnet treasury

const redis = Redis.fromEnv();
const TENANT_KEY = `raas:tenant:${SLUG}`;
const SLUG_KEY = `raas:slug:${SLUG}`;
const OWNER_INDEX = `raas:owner:${OWNER}`;

const existing = await redis.get(TENANT_KEY);
if (existing) {
  console.log(`tombola tenant already exists; doing nothing.`);
  console.log(JSON.stringify(existing, null, 2));
  process.exit(0);
}

const tenant = {
  slug: SLUG,
  display_name: "Tombola",
  status: "active" as const,
  owner_wallet: OWNER,
  treasury_wallet: OWNER,
  contact_email: "ops@tombola.app",
  created_at: new Date().toISOString(),
  branding: {
    logo_url: null,
    primary_color: "#88cfc4", // matches v1 --mint
    accent_color: "#c9b5dc", // matches v1 --lavender
    font_pair: "space-grotesk" as const,
    hero_headline: "On-chain raffles on Solana",
    hero_tagline: "Provably fair. Trustless settlement.",
    faq_overrides: {},
  },
  features: {
    recurring_enabled: true,
    custom_share_assets: false,
    friends_invite: true,
  },
  limits: {
    max_active_pools: 1000,
    max_monthly_pot_lamports: 100_000_000_000_000, // 100k SOL
  },
};

await redis.set(SLUG_KEY, {
  reserved_by_wallet: OWNER,
  reserved_at: tenant.created_at,
});
await redis.set(TENANT_KEY, tenant);

const owned = (await redis.get<string[]>(OWNER_INDEX)) ?? [];
if (!owned.includes(SLUG)) {
  owned.push(SLUG);
  await redis.set(OWNER_INDEX, owned);
}

console.log(`provisioned tombola tenant:`);
console.log(JSON.stringify(tenant, null, 2));

// src/lib/raas/tenant.ts — RaaS tenant KV CRUD.
import "server-only";
import { Redis } from "@upstash/redis";
import type { Tenant } from "@/types/raas";
import { isValidSlug } from "./slug.js";

const redis = Redis.fromEnv();

const TENANT_KEY = (slug: string) => `raas:tenant:${slug}`;
const SLUG_RESERVATION_KEY = (slug: string) => `raas:slug:${slug}`;
const OWNER_INDEX_KEY = (wallet: string) => `raas:owner:${wallet}`;

export interface CreateTenantInput {
  slug: string;
  display_name: string;
  owner_wallet: string;
  contact_email: string;
  primary_color: string;
  accent_color: string;
  treasury_wallet?: string; // default = owner_wallet
  logo_url?: string | null;
  font_pair?: "space-grotesk" | "inter" | "archivo" | "jetbrains-mono";
  hero_headline?: string;
  hero_tagline?: string;
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  if (!isValidSlug(input.slug)) {
    throw new Error(`invalid slug: ${input.slug}`);
  }

  const tenant: Tenant = {
    slug: input.slug,
    display_name: input.display_name,
    status: "active",
    owner_wallet: input.owner_wallet,
    treasury_wallet: input.treasury_wallet ?? input.owner_wallet,
    contact_email: input.contact_email,
    created_at: new Date().toISOString(),
    branding: {
      logo_url: input.logo_url ?? null,
      primary_color: input.primary_color,
      accent_color: input.accent_color,
      font_pair: input.font_pair ?? "space-grotesk",
      hero_headline:
        input.hero_headline ?? `${input.display_name} Raffles`,
      hero_tagline:
        input.hero_tagline ?? "On-chain raffles, branded for you.",
      faq_overrides: {},
    },
    features: {
      recurring_enabled: false,
      custom_share_assets: false,
      friends_invite: false,
    },
    limits: {
      max_active_pools: 50,
      max_monthly_pot_lamports: 1_000_000_000_000,
    },
  };

  // Atomic reservation via setnx — if another caller already took the slug,
  // setnx returns 0 and we reject.
  const reserved = await redis.setnx(SLUG_RESERVATION_KEY(input.slug), {
    reserved_by_wallet: input.owner_wallet,
    reserved_at: tenant.created_at,
  });
  if (reserved === 0) {
    throw new Error(`slug already exists: ${input.slug}`);
  }

  await redis.set(TENANT_KEY(input.slug), tenant);

  // Owner→slug index (append-style: read, push, write).
  const owned =
    (await redis.get<string[]>(OWNER_INDEX_KEY(input.owner_wallet))) ?? [];
  if (!owned.includes(input.slug)) {
    owned.push(input.slug);
    await redis.set(OWNER_INDEX_KEY(input.owner_wallet), owned);
  }

  return tenant;
}

export async function getTenant(slug: string): Promise<Tenant | null> {
  if (!isValidSlug(slug)) return null;
  return await redis.get<Tenant>(TENANT_KEY(slug));
}

export async function isSlugReserved(slug: string): Promise<boolean> {
  const v = await redis.get(SLUG_RESERVATION_KEY(slug));
  return v !== null;
}

export async function listOwnerSlugs(wallet: string): Promise<string[]> {
  return (await redis.get<string[]>(OWNER_INDEX_KEY(wallet))) ?? [];
}

// Internal: only exposed for operator admin endpoint (deferred to Plan 3).
export async function _setStatus(
  slug: string,
  status: "active" | "suspended",
): Promise<void> {
  const t = await getTenant(slug);
  if (!t) throw new Error(`tenant not found: ${slug}`);
  t.status = status;
  await redis.set(TENANT_KEY(slug), t);
}

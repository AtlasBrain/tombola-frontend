// src/types/raas.ts — RaaS tenant type definitions.

export type TenantStatus = "active" | "suspended";

export interface TenantBranding {
  logo_url: string | null;
  primary_color: string; // hex, e.g. "#88cfc4"
  accent_color: string; // hex
  font_pair: "space-grotesk" | "inter" | "archivo" | "jetbrains-mono";
  hero_headline: string;
  hero_tagline: string;
  faq_overrides: Record<string, string>;
}

export interface TenantFeatures {
  recurring_enabled: boolean; // MVP: false
  custom_share_assets: boolean; // MVP: false
  friends_invite: boolean; // MVP: false
}

export interface TenantLimits {
  max_active_pools: number; // default 50
  max_monthly_pot_lamports: number; // default 1_000_000_000_000 (1k SOL)
}

export interface Tenant {
  slug: string;
  display_name: string;
  status: TenantStatus;
  owner_wallet: string; // base58
  treasury_wallet: string;
  contact_email: string;
  created_at: string; // ISO8601
  branding: TenantBranding;
  features: TenantFeatures;
  limits: TenantLimits;
}

export interface PoolAttribution {
  tenant_slug: string;
  created_at: string;
  created_via: "manual"; // MVP: only manual; "recurring" added in Plan 3
}

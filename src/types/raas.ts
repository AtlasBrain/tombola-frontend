// src/types/raas.ts — RaaS tenant type definitions.

export type TenantStatus = "active" | "suspended" | "deleted";

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

export interface DelegatedSigner {
  pubkey: string; // base58
  created_at: string;
  revoked_at: string | null;
}

export interface TenantIntegrations {
  /** Discord Incoming Webhook URL. Set via AdminSettings / PATCH /api/r/tenant/[slug]/integrations. */
  discord_webhook_url?: string;
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
  delegated_signer?: DelegatedSigner | null;
  /** Optional third-party integration settings. Added in Plan 3 Phase G. */
  integrations?: TenantIntegrations;
}

export interface PoolAttribution {
  tenant_slug: string;
  created_at: string;
  created_via: "manual" | "recurring";
}

export interface Schedule {
  schedule_id: string;
  tenant_slug: string;
  cadence: "daily" | "weekly" | "biweekly" | "monthly";
  day_of_week: number | null; // 0-6 (Sun-Sat) for weekly/biweekly
  hour_utc: number; // 0-23
  template: {
    name_template: string; // e.g. "MrBeast Weekly #{n}"
    ticket_price_lamports: number;
    duration_seconds: number;
    creator_fee_bps: number;
    gating_mode: "public" | "whitelisted";
    invite_count: number | null;
  };
  next_run_at: string; // ISO8601
  status: "active" | "paused";
  run_count: number;
}

// src/lib/raas/slug.ts — RaaS tenant slug utilities.

const RESERVED = new Set([
  "onboard",
  "admin",
  "api",
  "ops",
  "_ops",
  "tenant",
  "tombola",
  "raffle",
  "pool",
  "create",
  "login",
  "signup",
  "static",
  "public",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

// Valid slug: 3–32 chars, lowercase alphanumeric + dash, no leading/trailing dash.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{3}$/;

export function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 32) return false;
  if (!SLUG_RE.test(slug)) return false;
  if (isReservedSlug(slug)) return false;
  return true;
}

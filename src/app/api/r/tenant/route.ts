// src/app/api/r/tenant/route.ts — Tenant creation endpoint.
import { NextResponse } from "next/server";
import { createTenant } from "@/lib/raas/tenant";
import { isValidSlug } from "@/lib/raas/slug";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.fixedWindow(3, "1 h"),
  prefix: "raas:onboard:rl",
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = await limiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Required fields
  const required = [
    "slug",
    "display_name",
    "owner_wallet",
    "contact_email",
    "primary_color",
    "accent_color",
  ];
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field]) {
      return NextResponse.json(
        { error: "missing_field", field },
        { status: 400 },
      );
    }
  }

  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  if (!HEX_COLOR_RE.test(body.primary_color as string)) {
    return NextResponse.json(
      { error: "invalid_color", field: "primary_color" },
      { status: 400 },
    );
  }
  if (!HEX_COLOR_RE.test(body.accent_color as string)) {
    return NextResponse.json(
      { error: "invalid_color", field: "accent_color" },
      { status: 400 },
    );
  }

  const slug = body.slug as string;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug", slug }, { status: 400 });
  }

  try {
    const tenant = await createTenant({
      slug,
      display_name: body.display_name as string,
      owner_wallet: body.owner_wallet as string,
      contact_email: body.contact_email as string,
      primary_color: body.primary_color as string,
      accent_color: body.accent_color as string,
      treasury_wallet: body.treasury_wallet as string | undefined,
      logo_url: body.logo_url as string | null | undefined,
      font_pair: body.font_pair as
        | "space-grotesk"
        | "inter"
        | "archivo"
        | "jetbrains-mono"
        | undefined,
      hero_headline: body.hero_headline as string | undefined,
      hero_tagline: body.hero_tagline as string | undefined,
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("taken")) {
      return NextResponse.json({ error: "slug_taken", slug }, { status: 409 });
    }
    return NextResponse.json({ error: "internal", detail: msg }, { status: 500 });
  }
}

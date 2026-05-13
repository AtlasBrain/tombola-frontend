// src/app/r/[tenant]/invite/[code]/page.tsx
// Server component: resolves tenant + active Whitelisted pool, then renders
// the branded invite page. 404s if tenant missing or no active Whitelisted pool.
import { notFound } from "next/navigation";
import "server-only";
import { Redis } from "@upstash/redis";
import { getTenant } from "@/lib/raas/tenant";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import { InviteRedeemFlow } from "@/components/raas/InviteRedeemFlow";

export const dynamic = "force-dynamic";

const redis = Redis.fromEnv();

async function findPoolForTenant(tenantSlug: string): Promise<string | null> {
  // Plan 3 v1: each tenant has at most one active Whitelisted pool at a time.
  // The pointer is written when a Whitelisted pool is created via POST /api/r/pool/[pubkey]/codes.
  // Multi-pool support is deferred to Plan 3.5.
  const poolPubkey = await redis.get<string>(
    `raas:tenant:${tenantSlug}:active_whitelisted_pool`,
  );
  return poolPubkey ?? null;
}

interface Props {
  params: Promise<{ tenant: string; code: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { tenant: slug, code } = await params;

  // URL-decode the code (invite links may URL-encode special characters)
  const rawCode = decodeURIComponent(code);

  const tenant = await getTenant(slug);
  if (!tenant) notFound();

  const poolPubkey = await findPoolForTenant(slug);
  if (!poolPubkey) notFound();

  return (
    <>
      <BrandedHeader tenant={tenant} />
      <main className="px-6 py-12 max-w-xl mx-auto">
        <InviteRedeemFlow
          tenantSlug={slug}
          tenantPrimaryColor={tenant.branding.primary_color}
          tenantDisplayName={tenant.display_name}
          poolPubkey={poolPubkey}
          rawCode={rawCode}
        />
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

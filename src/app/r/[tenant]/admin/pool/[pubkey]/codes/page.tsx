import { notFound } from "next/navigation";
import { getTenant } from "@/lib/raas/tenant";
import { fetchPoolState } from "@/lib/raas/pool-fetch";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import { CodeManager } from "@/components/raas/CodeManager";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ tenant: string; pubkey: string }>;
}

export default async function CodesPage({ params }: Props) {
  const { tenant: slug, pubkey } = await params;

  const [tenant, pool] = await Promise.all([
    getTenant(slug),
    fetchPoolState(pubkey),
  ]);

  if (!tenant) notFound();
  if (!pool) notFound();

  // Invite codes only apply to WhitelistMode pools.
  if (pool.access_mode !== "WhitelistMode") {
    return (
      <>
        <BrandedHeader tenant={tenant} />
        <main className="px-6 py-12 max-w-3xl mx-auto">
          <p className="opacity-70">
            This is a Public-mode raffle — no invite codes to manage.
          </p>
        </main>
        <PoweredByTombolaFooter />
      </>
    );
  }

  return (
    <>
      <BrandedHeader tenant={tenant} />
      <main className="px-6 py-12 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {tenant.display_name} — Invite codes
          </h1>
          <p className="text-sm opacity-60 font-mono mt-1">
            {pubkey.slice(0, 24)}…
          </p>
        </div>
        <CodeManager
          tenantSlug={slug}
          poolPubkey={pubkey}
          tenantPrimaryColor={tenant.branding.primary_color}
        />
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

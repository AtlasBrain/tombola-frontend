import { getTenant } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { notFound } from "next/navigation";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TenantPublicPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenant(slug);
  if (!tenant) notFound();

  const pools = await listTenantPools(slug);

  return (
    <>
      <BrandedHeader tenant={tenant} />
      <main className="px-6 py-12 max-w-4xl mx-auto space-y-12">
        <section className="text-center space-y-3">
          <h1
            className="text-4xl font-bold"
            style={{ color: tenant.branding.primary_color }}
          >
            {tenant.branding.hero_headline}
          </h1>
          <p className="opacity-80">{tenant.branding.hero_tagline}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Active raffles</h2>
          {pools.length === 0 ? (
            <p className="opacity-60">No active raffles yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pools.map((p) => (
                <li
                  key={p}
                  className="rounded-md border border-white/10 p-4 hover:border-white/30"
                >
                  <Link href={`/r/${slug}/pool/${p}`} className="font-mono text-sm">
                    {p.slice(0, 16)}…
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

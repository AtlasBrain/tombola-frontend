import { getTenant } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import { AdminDashboard } from "@/components/raas/AdminDashboard";

export default async function TenantAdminPage({
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
      <main className="px-6 py-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">{tenant.display_name}</h1>
          <Link
            href={`/r/${tenant.slug}/create`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md font-semibold text-black text-sm whitespace-nowrap"
            style={{ background: tenant.branding.primary_color }}
          >
            + Create raffle
          </Link>
        </div>
        <AdminDashboard tenant={tenant} poolPubkeys={pools} />
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

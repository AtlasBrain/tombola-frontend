import { getTenant } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { notFound } from "next/navigation";
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
        <h1 className="text-3xl font-bold mb-6">{tenant.display_name}</h1>
        <AdminDashboard tenant={tenant} poolPubkeys={pools} />
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

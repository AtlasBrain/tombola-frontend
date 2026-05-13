import { getTenant } from "@/lib/raas/tenant";
import { getSolUsd } from "@/lib/raas/sol-usd";
import { notFound } from "next/navigation";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import { CreatePoolWizard } from "@/components/raas/CreatePoolWizard";

export default async function CreatePoolPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenant(slug);
  if (!tenant) notFound();
  const solUsd = await getSolUsd();

  return (
    <>
      <BrandedHeader tenant={tenant} />
      <main className="px-6 py-12 max-w-xl mx-auto">
        <CreatePoolWizard tenant={tenant} solUsd={solUsd} />
      </main>
      <PoweredByTombolaFooter />
    </>
  );
}

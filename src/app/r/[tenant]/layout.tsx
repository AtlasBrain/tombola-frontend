// src/app/r/[tenant]/layout.tsx — RaaS tenant layout.
// Resolves tenant from KV, hydrates CSS vars, attaches React context.
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/raas/tenant";
import { TenantProvider } from "@/components/raas/TenantContext";
import { RaasNotificationListener } from "@/components/raas/RaasNotificationListener";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenant(slug);

  if (!tenant || tenant.status !== "active") {
    notFound();
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --raas-primary: ${tenant.branding.primary_color};
              --raas-accent: ${tenant.branding.accent_color};
            }
          `,
        }}
      />
      <TenantProvider tenant={tenant}>
        {children}
        <RaasNotificationListener />
      </TenantProvider>
    </>
  );
}

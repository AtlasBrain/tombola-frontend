import type { Tenant } from "@/types/raas";

export function BrandedHeader({ tenant }: { tenant: Tenant }) {
  return (
    <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {tenant.branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.branding.logo_url}
            alt={tenant.display_name}
            className="h-8 w-8 rounded-md"
          />
        ) : (
          <div
            className="h-8 w-8 rounded-md"
            style={{ background: tenant.branding.primary_color }}
          />
        )}
        <span className="font-semibold">{tenant.display_name}</span>
      </div>
    </header>
  );
}

import { getTenant } from "@/lib/raas/tenant";
import { listTenantPools } from "@/lib/raas/pool-attribution";
import { notFound } from "next/navigation";
import { BrandedHeader } from "@/components/raas/BrandedHeader";
import { PoweredByTombolaFooter } from "@/components/raas/PoweredByTombolaFooter";
import Link from "next/link";

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
      <main className="px-6 py-12 max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">{tenant.display_name} — Admin</h1>
        <p className="opacity-70">
          You&apos;re signed up. Use the link below to create your first raffle. The
          public can buy tickets from any raffle you create at{" "}
          <code className="font-mono">tombola.app/r/{slug}</code>.
        </p>
        <Link
          href={`/r/${slug}/create`}
          className="inline-block px-4 py-2 rounded-md bg-mint text-black font-semibold"
        >
          Create a raffle
        </Link>

        <section className="pt-6 border-t border-white/10">
          <h2 className="font-semibold mb-3">Your raffles ({pools.length})</h2>
          {pools.length === 0 ? (
            <p className="opacity-60 text-sm">None yet.</p>
          ) : (
            <ul className="space-y-2">
              {pools.map((p) => (
                <li key={p}>
                  <Link
                    href={`/r/${slug}/pool/${p}`}
                    className="font-mono text-sm hover:underline"
                  >
                    {p.slice(0, 24)}…
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

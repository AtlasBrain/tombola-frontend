// src/app/r/_ops/page.tsx — Operator dashboard overview KPIs.
// Server component: aggregates tenant stats from KV.
import "server-only";
import { Redis } from "@upstash/redis";
import type { Tenant } from "@/types/raas";
import Link from "next/link";

const redis = Redis.fromEnv();

async function getOpsStats() {
  const slugs = (await redis.get<string[]>("raas:tenants:index")) ?? [];
  let active = 0;
  let suspended = 0;
  let deleted = 0;
  for (const slug of slugs) {
    const t = await redis.get<Tenant>(`raas:tenant:${slug}`);
    if (!t) continue;
    if (t.status === "active") active++;
    else if (t.status === "suspended") suspended++;
    else if (t.status === "deleted") deleted++;
  }
  return {
    total: slugs.length,
    active,
    suspended,
    deleted,
  };
}

export default async function OpsPage() {
  const stats = await getOpsStats();

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Tombola Operator Console</h1>
        <p className="text-sm opacity-60 mt-1">Internal — do not share this URL.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total tenants" value={stats.total} />
        <KpiCard label="Active" value={stats.active} color="text-green-400" />
        <KpiCard label="Suspended" value={stats.suspended} color="text-yellow-400" />
        <KpiCard label="Deleted" value={stats.deleted} color="text-red-400" />
      </div>

      <nav className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NavCard href="/r/_ops/tenants" label="Tenants" desc="List, suspend, revoke delegation" />
        <NavCard href="/r/_ops/audit-log" label="Audit Log" desc="Every operator action logged" />
        <NavCard href="/r/_ops/revenue" label="Revenue" desc="Per-tenant protocol fees" />
        <NavCard href="/r/_ops/compliance" label="Compliance" desc="Flagged tenants + manual flags" />
      </nav>
    </main>
  );
}

function KpiCard({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="border border-white/10 rounded-lg p-4 space-y-1">
      <p className="text-xs opacity-60">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function NavCard({
  href,
  label,
  desc,
}: {
  href: string;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="border border-white/10 rounded-lg p-4 hover:border-white/30 transition space-y-1 block"
    >
      <p className="font-semibold">{label}</p>
      <p className="text-xs opacity-60">{desc}</p>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Tenant } from "@/types/raas";
import type { AudienceEntry } from "@/app/api/r/tenant/[slug]/audience/route";

interface Props {
  tenant: Tenant;
  poolPubkeys: string[];
}

export function AdminAudience({ tenant }: Props) {
  const [audience, setAudience] = useState<AudienceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/r/tenant/${tenant.slug}/audience`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`audience_error_${res.status}`);
        const data = (await res.json()) as { audience: AudienceEntry[] };
        setAudience(data.audience);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [tenant.slug]);

  if (loading) return <p className="opacity-60 text-sm">Loading audience…</p>;

  if (error) {
    return (
      <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
        Failed to load audience: {error}
      </div>
    );
  }

  if (audience.length === 0) {
    return (
      <p className="opacity-60 text-sm">
        No winners recorded yet. Audience data appears after raffles settle.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm opacity-60">
        Top {audience.length} winner wallets across your raffles (sorted by wins).
      </p>
      <div className="divide-y divide-white/10 border border-white/10 rounded-md">
        {audience.map((entry, i) => (
          <div
            key={entry.wallet}
            className="p-3 flex items-center gap-3 justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="text-xs font-mono opacity-40 shrink-0 w-6 text-right"
              >
                {i + 1}
              </span>
              <span className="font-mono text-sm truncate" title={entry.wallet}>
                {entry.wallet.slice(0, 12)}…{entry.wallet.slice(-6)}
              </span>
            </div>
            <div className="flex gap-4 text-xs opacity-70 shrink-0">
              <span
                className="font-semibold"
                style={{ color: tenant.branding.primary_color }}
              >
                {entry.wins} {entry.wins === 1 ? "win" : "wins"}
              </span>
              <span>{entry.tickets} tickets</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

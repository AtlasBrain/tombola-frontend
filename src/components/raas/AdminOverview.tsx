"use client";

import { useEffect, useState } from "react";
import type { Tenant } from "@/types/raas";

interface Props {
  tenant: Tenant;
  poolPubkeys: string[];
}

interface MetricsResponse {
  total_pools: number;
  total_pot_lamports: string;
  total_tickets: number;
  total_creator_fees_lamports: string;
  unique_buyers: number;
}

interface Metrics {
  total_pools: number;
  total_pot_lamports: bigint;
  total_tickets: number;
  total_creator_fees_lamports: bigint;
  unique_buyers: number;
}

export function AdminOverview({ tenant }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMetrics(null);
    setError(null);
    fetch(`/api/r/tenant/${tenant.slug}/metrics`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`metrics_error_${res.status}`);
        const json = (await res.json()) as MetricsResponse;
        setMetrics({
          total_pools: json.total_pools,
          total_pot_lamports: BigInt(json.total_pot_lamports),
          total_tickets: json.total_tickets,
          total_creator_fees_lamports: BigInt(json.total_creator_fees_lamports),
          unique_buyers: json.unique_buyers,
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [tenant.slug]);

  if (error) {
    return (
      <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
        Failed to load metrics: {error}
      </div>
    );
  }

  if (!metrics) {
    return <p className="opacity-60 text-sm">Loading metrics…</p>;
  }

  const fmtSol = (lamports: bigint) =>
    (Number(lamports) / 1e9).toFixed(3) + " SOL";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total raffles" value={metrics.total_pools} />
        <KPI label="Total pot" value={fmtSol(metrics.total_pot_lamports)} />
        <KPI label="Tickets sold" value={metrics.total_tickets} />
        <KPI
          label="Earnings"
          value={fmtSol(metrics.total_creator_fees_lamports)}
          accent={tenant.branding.primary_color}
        />
      </div>
      <div className="rounded-md border border-white/10 p-4 text-sm opacity-60">
        {metrics.unique_buyers} unique winner wallets recorded
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 p-4">
      <div className="text-xs opacity-60 mb-1">{label}</div>
      <div
        className="text-2xl font-semibold"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

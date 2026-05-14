"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Tenant } from "@/types/raas";
import type { PoolFetchedState } from "@/lib/raas/pool-fetch";
import { CodeManager } from "./CodeManager";

interface Props {
  tenant: Tenant;
  poolPubkeys: string[];
}

type FilterState = "all" | "Open" | "AwaitingVrf" | "Resolved";

const FILTER_LABELS: Record<FilterState, string> = {
  all: "All",
  Open: "Active",
  AwaitingVrf: "Drawing",
  Resolved: "Settled",
};

interface PoolRow extends PoolFetchedState {
  pubkey: string;
}

export function AdminRaffles({ tenant, poolPubkeys }: Props) {
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      poolPubkeys.map(async (pubkey) => {
        const res = await fetch(`/api/r/pool/${pubkey}/state`);
        if (!res.ok) return null;
        const state = (await res.json()) as PoolFetchedState;
        return { ...state, pubkey };
      }),
    )
      .then((results) => {
        setRows(results.filter((r): r is PoolRow => r !== null));
      })
      .finally(() => setLoading(false));
  }, [poolPubkeys]);

  const filtered = rows.filter(
    (r) => filter === "all" || r.state === filter,
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(["all", "Open", "AwaitingVrf", "Resolved"] as FilterState[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border transition ${
                filter === f
                  ? "border-current"
                  : "border-white/20 opacity-60 hover:opacity-100"
              }`}
              style={
                filter === f
                  ? { color: tenant.branding.primary_color, borderColor: tenant.branding.primary_color }
                  : undefined
              }
            >
              {FILTER_LABELS[f]}
            </button>
          ),
        )}
      </div>

      {loading && <p className="opacity-60 text-sm">Loading pools…</p>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 border border-dashed border-white/10 rounded-md">
          <p className="opacity-60 text-sm mb-3">
            {filter === "all"
              ? "You haven't created any raffles yet."
              : "No raffles match this filter."}
          </p>
          {filter === "all" && (
            <Link
              href={`/r/${tenant.slug}/create`}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md font-semibold text-black text-sm"
              style={{ background: tenant.branding.primary_color }}
            >
              + Create your first raffle
            </Link>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="divide-y divide-white/10 border border-white/10 rounded-md">
          {filtered.map((row) => (
            <div key={row.pubkey}>
              <div className="p-3 flex items-center gap-3 justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/r/${tenant.slug}/pool/${row.pubkey}`}
                    className="font-mono text-sm hover:underline block truncate"
                  >
                    {row.pubkey.slice(0, 20)}…
                  </Link>
                  <div className="text-xs opacity-60 mt-0.5 flex gap-3">
                    <span>{row.total_tickets} tickets</span>
                    <span>
                      {(Number(row.total_pot_lamports) / 1e9).toFixed(3)} SOL pot
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        row.state === "Open"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : row.state === "AwaitingVrf"
                          ? "bg-yellow-500/20 text-yellow-200"
                          : "bg-neutral-500/20 text-neutral-200"
                      }`}
                    >
                      {row.state}
                    </span>
                    {row.access_mode === "WhitelistMode" && (
                      <span className="bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded">
                        Whitelisted
                      </span>
                    )}
                  </div>
                </div>

                {row.access_mode === "WhitelistMode" && (
                  <button
                    onClick={() =>
                      setExpanded(expanded === row.pubkey ? null : row.pubkey)
                    }
                    className="text-xs underline opacity-60 hover:opacity-100 shrink-0"
                  >
                    {expanded === row.pubkey ? "Hide codes" : "Manage codes"}
                  </button>
                )}
              </div>

              {expanded === row.pubkey &&
                row.access_mode === "WhitelistMode" && (
                  <div className="border-t border-white/10 p-4 bg-white/5">
                    <CodeManager
                      tenantSlug={tenant.slug}
                      poolPubkey={row.pubkey}
                      tenantPrimaryColor={tenant.branding.primary_color}
                    />
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

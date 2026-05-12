"use client";

// /admin/treasury — read-only protocol wallet.
//
// Important design constraint (architecture doc §5): this page NEVER
// has the ability to move funds. No "send" button, no signer in scope,
// no withdraw instruction. Treasury actions happen in Squads; this
// page just gives you a clean readout + deep links.

import { useEffect, useState } from "react";
import { formatSol, shortAddress } from "@/lib/format";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";

interface TreasuryPayload {
  treasuryAddress: string;
  treasuryBalanceLamports: string;
  upgradeAuthority: string | null;
  upgradeAuthorityRevoked: boolean;
  deployerPubkey: string;
  rotation: {
    treasuryIsDeployer: boolean;
    upgradeAuthorityIsDeployer: boolean;
  };
  cluster: "devnet" | "mainnet" | "localnet" | "unknown";
  unrealizedFeesLamports: string;
  unrealizedFeesPoolCount: number;
  inflows: Array<{
    signature: string;
    blockTime: number | null;
    deltaLamports: string;
    slot: number;
  }>;
  links: {
    solanaExplorerTreasury: string;
    solanaExplorerProgram: string;
    squadsVault: string;
  };
  generatedAt: number;
}

export default function AdminTreasuryPage() {
  const [data, setData] = useState<TreasuryPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctl = { cancelled: false };
    async function load() {
      try {
        const r = await fetch("/api/admin/treasury", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const p = (await r.json()) as TreasuryPayload;
        if (!ctl.cancelled) {
          setData(p);
          setErr(null);
        }
      } catch (e) {
        if (!ctl.cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      ctl.cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Treasury</h1>
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          {err}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-display text-3xl uppercase">Treasury</h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Loading…
        </p>
      </main>
    );
  }

  const balance = BigInt(data.treasuryBalanceLamports);
  const unrealized = BigInt(data.unrealizedFeesLamports);
  const totalExposure = balance + unrealized;
  const isRotated =
    !data.rotation.treasuryIsDeployer && !data.rotation.upgradeAuthorityIsDeployer;

  return (
    <main className="mx-auto max-w-5xl px-8 pb-16 pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-tight">
            Treasury
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
            Read-only · cluster: {data.cluster} · refresh {ago(data.generatedAt)}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Phase 3 · no signers · move funds via Squads
        </p>
      </div>

      {/* Rotation warning — only shows when deployer key still controls
          something. Architecture doc D-009. */}
      {data.deployerPubkey && !isRotated && (
        <div
          className="mt-6 rounded-2xl border p-5"
          style={{
            background: `linear-gradient(135deg, ${CORAL}1a, ${CORAL}05 60%, transparent), #0a0a0a`,
            borderColor: `${CORAL}55`,
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: CORAL }}
          >
            ▲ ROTATION PENDING
          </p>
          <h2 className="mt-1 font-display text-xl uppercase">
            Deployer key still has authority
          </h2>
          <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-neutral-300">
            {data.rotation.treasuryIsDeployer && (
              <li>
                ✗ Treasury pubkey = deployer key. Rotate to a Squads 2-of-3
                vault before mainnet (see SESSION_HANDOFF.md pre-mainnet
                checklist, step 5).
              </li>
            )}
            {data.rotation.upgradeAuthorityIsDeployer && (
              <li>
                ✗ Program upgrade authority = deployer key. Rotate to Squads
                before mainnet (step 4).
              </li>
            )}
          </ul>
        </div>
      )}
      {data.deployerPubkey && isRotated && (
        <div
          className="mt-6 rounded-2xl border p-4"
          style={{
            background: `${MINT}10`,
            borderColor: `${MINT}55`,
          }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: MINT }}
          >
            ✓ ROTATION COMPLETE — treasury + upgrade authority no longer the deployer
          </p>
        </div>
      )}
      {!data.deployerPubkey && (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-4 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          DEPLOYER_PUBKEY env not set — rotation check disabled
        </div>
      )}

      {/* Headline KPIs */}
      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="LIVE BALANCE"
          value={formatSol(balance)}
          accent={MINT}
          sub={
            data.treasuryAddress
              ? `${shortAddress(data.treasuryAddress)} · ${data.cluster.toUpperCase()}`
              : "ADDRESS UNAVAILABLE"
          }
        />
        <Kpi
          label="UNREALIZED FEES"
          value={formatSol(unrealized)}
          accent={SAND}
          sub={`ACROSS ${data.unrealizedFeesPoolCount} OPEN POOL${data.unrealizedFeesPoolCount === 1 ? "" : "S"}`}
        />
        <Kpi
          label="TOTAL EXPOSURE"
          value={formatSol(totalExposure)}
          sub="REALIZED + UNREALIZED"
        />
        <Kpi
          label="UPGRADE AUTHORITY"
          value={
            data.upgradeAuthorityRevoked
              ? "IMMUTABLE"
              : data.upgradeAuthority
                ? shortAddress(data.upgradeAuthority)
                : "UNKNOWN"
          }
          accent={
            data.upgradeAuthorityRevoked
              ? MINT
              : data.rotation.upgradeAuthorityIsDeployer
                ? CORAL
                : LAVENDER
          }
          sub={
            data.upgradeAuthorityRevoked
              ? "PROGRAM CAN'T BE UPGRADED"
              : data.rotation.upgradeAuthorityIsDeployer
                ? "STILL DEPLOYER KEY"
                : "ROTATED ✓"
          }
        />
      </section>

      {/* Identity card */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-display text-base uppercase tracking-wide">
          On-chain addresses
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <Address
            label="Treasury (ProtocolConfig.treasury)"
            value={data.treasuryAddress || "—"}
            link={data.links.solanaExplorerTreasury}
            warn={data.rotation.treasuryIsDeployer}
          />
          <Address
            label="Program upgrade authority"
            value={
              data.upgradeAuthorityRevoked
                ? "REVOKED — program is immutable"
                : (data.upgradeAuthority ?? "—")
            }
            link={
              data.upgradeAuthority
                ? `https://explorer.solana.com/address/${data.upgradeAuthority}?cluster=${cluster(data.cluster)}`
                : null
            }
            warn={data.rotation.upgradeAuthorityIsDeployer}
          />
          {data.deployerPubkey && (
            <Address
              label="Deployer key (env DEPLOYER_PUBKEY)"
              value={data.deployerPubkey}
              link={`https://explorer.solana.com/address/${data.deployerPubkey}?cluster=${cluster(data.cluster)}`}
            />
          )}
        </div>
      </section>

      {/* Action panel */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-display text-base uppercase tracking-wide">
          Move funds
        </h2>
        <p className="mt-2 text-sm text-neutral-300">
          Tombola&apos;s raffle program has no on-chain withdraw instruction
          by design — adding one would invalidate the non-custodial
          guarantee documented in <code className="font-mono text-[11px] text-neutral-400">THREAT_MODEL.md</code>.
          Treasury transfers happen entirely in the Squads UI. Two-of-three
          signatures required for every spend.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {data.links.squadsVault && (
            <a
              href={data.links.squadsVault}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition hover:brightness-110"
              style={{ background: MINT, color: "#000" }}
            >
              OPEN IN SQUADS →
            </a>
          )}
          {data.links.solanaExplorerTreasury && (
            <a
              href={data.links.solanaExplorerTreasury}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-neutral-700 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-neutral-200 transition hover:border-neutral-500"
            >
              SOLANA EXPLORER →
            </a>
          )}
          <a
            href={data.links.solanaExplorerProgram}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-neutral-700 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest text-neutral-200 transition hover:border-neutral-500"
          >
            PROGRAM ON EXPLORER →
          </a>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
          Recommended cash-out path: protocol treasury → payroll vault → individual employees
        </p>
      </section>

      {/* Recent inflows */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-base uppercase tracking-wide">
            Recent treasury activity
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            LAST {data.inflows.length} TX
          </span>
        </div>
        {data.inflows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            No recent activity on this address
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                <th className="py-2">SIGNATURE</th>
                <th className="py-2 text-right">DELTA</th>
                <th className="py-2 text-right">SLOT</th>
                <th className="py-2 text-right">WHEN</th>
              </tr>
            </thead>
            <tbody>
              {data.inflows.map((row) => {
                const d = BigInt(row.deltaLamports);
                const inflow = d > 0n;
                return (
                  <tr
                    key={row.signature}
                    className="border-t border-dashed border-neutral-800"
                  >
                    <td className="py-2.5">
                      <a
                        href={`https://explorer.solana.com/tx/${row.signature}?cluster=${cluster(data.cluster)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[12px] text-neutral-300 transition hover:text-neutral-100 hover:underline"
                      >
                        {row.signature.slice(0, 8)}…{row.signature.slice(-8)} ↗
                      </a>
                    </td>
                    <td
                      className="py-2.5 text-right font-mono text-xs font-bold tabular-nums"
                      style={{
                        color:
                          d === 0n
                            ? "#737373"
                            : inflow
                              ? MINT
                              : CORAL,
                      }}
                    >
                      {d === 0n ? "0" : `${inflow ? "+" : ""}${formatSol(d)}`}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[11px] tabular-nums text-neutral-500">
                      {row.slot.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                      {row.blockTime ? whenAgo(row.blockTime) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Address({
  label,
  value,
  link,
  warn,
}: {
  label: string;
  value: string;
  link: string | null;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {label}
        </span>
        <span className="font-mono text-[12px] text-neutral-100">{value}</span>
      </div>
      <div className="flex items-center gap-2">
        {warn && (
          <span
            className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
            style={{
              background: `${CORAL}1a`,
              borderColor: `${CORAL}55`,
              color: CORAL,
            }}
          >
            ▲ DEPLOYER
          </span>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-neutral-700 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-200 transition hover:border-neutral-500"
          >
            EXPLORER ↗
          </a>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <article
      className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5"
      style={
        accent
          ? {
              background: `linear-gradient(135deg, ${accent}12, ${accent}03 60%, transparent), rgba(23,23,23,.4)`,
            }
          : undefined
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p
        className="mt-2 font-display text-3xl tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {sub}
        </p>
      )}
    </article>
  );
}

function cluster(c: TreasuryPayload["cluster"]): string {
  return c === "mainnet" ? "mainnet-beta" : c;
}

function ago(unixSec: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3_600)}h ago`;
}

function whenAgo(unixSec: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (delta < 60) return `${delta}S AGO`;
  if (delta < 3_600) return `${Math.floor(delta / 60)}M AGO`;
  if (delta < 86_400) return `${Math.floor(delta / 3_600)}H AGO`;
  return `${Math.floor(delta / 86_400)}D AGO`;
}

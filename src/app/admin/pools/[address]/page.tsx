"use client";

// /admin/pools/[address] — single-pool drill-down.
//
// Renders ledger math (pot → winner / treasury / creator / vrf split),
// participant table, invite roster (private pools), and risk flags.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CORAL, LAVENDER, MINT, SAND } from "@/lib/colors";
import { formatSol, shortAddress } from "@/lib/format";
import { Countdown } from "@/components/Countdown";

interface PoolDetail {
  address: string;
  kind: "public" | "private";
  poolType?: number;
  round?: string;
  creator?: string;
  creatorFeeBps?: number;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: string;
  totalPotLamports: string;
  ticketPriceLamports: string;
  winner: string | null;
  winningTicketId: string | null;
  ledger: {
    grossProtocolFeeLamports: string;
    treasuryShareLamports: string;
    creatorShareLamports: string;
    winnerShareLamports: string;
    vrfPaidLamports: string;
  };
  participants: Array<{
    wallet: string;
    tickets: string;
    spentLamports: string;
    sharePct: number;
  }>;
  invites?: Array<{
    friend: string;
    status: "sent" | "redeemed";
  }>;
  flags: string[];
}

const PUBLIC_LABEL: Record<number, string> = {
  0: "WEEKLY",
  1: "BIWEEKLY",
  2: "TRIWEEKLY",
  3: "MONTHLY",
};
const PUBLIC_ACCENT: Record<number, string> = {
  0: LAVENDER,
  1: CORAL,
  2: MINT,
  3: SAND,
};

export default function AdminPoolDetailPage() {
  const { address } = useParams<{ address: string }>();
  const [data, setData] = useState<PoolDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctl = { cancelled: false };
    async function load() {
      try {
        const r = await fetch(`/api/admin/pools/${address}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const p = (await r.json()) as PoolDetail;
        if (!ctl.cancelled) setData(p);
      } catch (e) {
        if (!ctl.cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      ctl.cancelled = true;
    };
  }, [address]);

  if (err) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <BackLink />
        <p className="mt-4 rounded-xl border border-rose-700/40 bg-rose-900/20 p-3 text-sm text-rose-300">
          {err}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-8 py-10">
        <BackLink />
        <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          Loading…
        </p>
      </main>
    );
  }

  const accent =
    data.kind === "private"
      ? "#fafafa"
      : (PUBLIC_ACCENT[data.poolType ?? 0] ?? MINT);
  const name =
    data.kind === "private"
      ? `PRIVATE · ${shortAddress(data.address)}`
      : `${PUBLIC_LABEL[data.poolType ?? 0] ?? "PUBLIC"} #${data.round}`;
  const stateLabel = data.state === 0 ? "OPEN" : data.state === 1 ? "DRAWING" : "RESOLVED";

  return (
    <main className="mx-auto max-w-5xl px-8 pb-16 pt-8">
      <BackLink />

      <header className="mt-3 flex flex-wrap items-baseline gap-4">
        <span
          aria-hidden
          className="h-10 w-1.5 rounded-full"
          style={{ background: accent }}
        />
        <h1 className="font-display text-3xl uppercase tracking-tight">
          {name}
        </h1>
        <span
          className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest"
          style={{
            borderColor: `${accent}55`,
            background: `${accent}15`,
            color: accent,
          }}
        >
          {stateLabel}
          {data.state === 0 && data.closeTimeUnix * 1000 > Date.now() && (
            <>
              {" · CLOSES IN "}
              <Countdown targetUnix={data.closeTimeUnix} />
            </>
          )}
        </span>
        {data.flags.map((f) => (
          <span
            key={f}
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest"
            style={{
              background: `${CORAL}1a`,
              borderColor: `${CORAL}55`,
              color: CORAL,
            }}
          >
            ▲ {f.replace(/_/g, " ")}
          </span>
        ))}
      </header>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-neutral-500">
        {data.address}
        {data.creator && (
          <>
            {" · CREATED BY "}
            <Link
              href={`/admin/users/${data.creator}`}
              className="text-neutral-300 hover:underline"
            >
              {shortAddress(data.creator)}
            </Link>
          </>
        )}
        {typeof data.creatorFeeBps === "number" &&
          data.creatorFeeBps > 0 &&
          ` · CREATOR FEE ${(data.creatorFeeBps / 100).toFixed(2)}%`}
      </p>

      {/* Ledger */}
      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="TOTAL POT"
          value={formatSol(BigInt(data.totalPotLamports))}
          accent={accent}
        />
        <Kpi
          label="WINNER SHARE"
          value={formatSol(BigInt(data.ledger.winnerShareLamports))}
          accent={MINT}
          sub={data.winner ? shortAddress(data.winner) : "PENDING"}
        />
        <Kpi
          label="TREASURY"
          value={formatSol(BigInt(data.ledger.treasuryShareLamports))}
          sub={`GROSS ${formatSol(BigInt(data.ledger.grossProtocolFeeLamports))}`}
        />
        <Kpi
          label="CREATOR FEE"
          value={formatSol(BigInt(data.ledger.creatorShareLamports))}
          sub={
            data.kind === "private"
              ? `${((data.creatorFeeBps ?? 0) / 100).toFixed(2)}%`
              : "N/A — PUBLIC"
          }
        />
        <Kpi
          label="VRF PAID"
          value={formatSol(BigInt(data.ledger.vrfPaidLamports))}
          sub="REIMBURSED FROM FEE"
        />
      </section>

      {/* Pot composition */}
      <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="font-display text-base uppercase tracking-wide">
          Pot composition
        </h2>
        <CompositionBar
          totalPot={BigInt(data.totalPotLamports)}
          treasury={BigInt(data.ledger.treasuryShareLamports)}
          creator={BigInt(data.ledger.creatorShareLamports)}
          winner={BigInt(data.ledger.winnerShareLamports)}
          vrf={BigInt(data.ledger.vrfPaidLamports)}
        />
      </section>

      {/* Participants */}
      <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-base uppercase tracking-wide">
            Participants ({data.participants.length})
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            TOTAL {data.totalTickets} TICKETS
          </span>
        </div>
        {data.participants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 p-6 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500">
            No tickets bought yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                <th className="py-2">WALLET</th>
                <th className="py-2 text-right">TICKETS</th>
                <th className="py-2 text-right">SPENT</th>
                <th className="py-2 text-right">SHARE</th>
                <th className="py-2 text-right">OUTCOME</th>
              </tr>
            </thead>
            <tbody>
              {data.participants.slice(0, 200).map((part) => {
                const isWinner = data.winner === part.wallet;
                return (
                  <tr key={part.wallet} className="border-t border-dashed border-neutral-800">
                    <td className="py-2.5">
                      <Link
                        href={`/admin/users/${part.wallet}`}
                        className="font-mono text-[12px] text-neutral-200 transition hover:underline"
                      >
                        {shortAddress(part.wallet)}
                      </Link>
                      {data.creator === part.wallet && (
                        <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
                          CREATOR
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">
                      {part.tickets}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">
                      {formatSol(BigInt(part.spentLamports))}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">
                      {part.sharePct.toFixed(part.sharePct < 10 ? 2 : 1)}%
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">
                      {data.state === 2 ? (
                        isWinner ? (
                          <span style={{ color: MINT }}>
                            🏆 +{formatSol(BigInt(data.ledger.winnerShareLamports))}
                          </span>
                        ) : (
                          <span style={{ color: "#737373" }}>
                            −{formatSol(BigInt(part.spentLamports))}
                          </span>
                        )
                      ) : (
                        <span style={{ color: "#737373" }}>PENDING</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.participants.length > 200 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-3 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-600"
                  >
                    Showing first 200 · {data.participants.length - 200} more
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Invites (private only) */}
      {data.invites && (
        <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <h2 className="font-display text-base uppercase tracking-wide">
            Invites ({data.invites.length})
          </h2>
          {data.invites.length === 0 ? (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              No invites allocated
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {data.invites.map((inv) => (
                <div
                  key={inv.friend}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2"
                >
                  <Link
                    href={`/admin/users/${inv.friend}`}
                    className="font-mono text-[12px] text-neutral-200 transition hover:underline"
                  >
                    {shortAddress(inv.friend)}
                  </Link>
                  <span
                    className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest"
                    style={
                      inv.status === "redeemed"
                        ? {
                            background: `${MINT}1a`,
                            borderColor: `${MINT}55`,
                            color: MINT,
                          }
                        : {
                            background: `${SAND}1a`,
                            borderColor: `${SAND}55`,
                            color: SAND,
                          }
                    }
                  >
                    {inv.status === "redeemed" ? "REDEEMED ✓" : "SENT"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/pools"
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500 transition hover:text-neutral-100"
    >
      ← BACK TO POOLS
    </Link>
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
      className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4"
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
        className="mt-1 font-display text-xl tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-neutral-500">
          {sub}
        </p>
      )}
    </article>
  );
}

function CompositionBar({
  totalPot,
  treasury,
  creator,
  winner,
  vrf,
}: {
  totalPot: bigint;
  treasury: bigint;
  creator: bigint;
  winner: bigint;
  vrf: bigint;
}) {
  if (totalPot === 0n) {
    return (
      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        Pool has no pot yet
      </p>
    );
  }
  const pct = (v: bigint): number =>
    Number((v * 10_000n) / totalPot) / 100;
  const wPct = pct(winner);
  const tPct = pct(treasury);
  const cPct = pct(creator);
  const vPct = pct(vrf);
  return (
    <div className="mt-4 space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full border border-neutral-800">
        <span style={{ width: `${wPct}%`, background: MINT }} />
        <span style={{ width: `${cPct}%`, background: LAVENDER }} />
        <span style={{ width: `${tPct}%`, background: SAND }} />
        <span style={{ width: `${vPct}%`, background: CORAL }} />
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[11px] md:grid-cols-4">
        <Legend swatch={MINT} label="WINNER" pct={wPct} lamports={winner} />
        <Legend swatch={LAVENDER} label="CREATOR" pct={cPct} lamports={creator} />
        <Legend swatch={SAND} label="TREASURY" pct={tPct} lamports={treasury} />
        <Legend swatch={CORAL} label="VRF PAID" pct={vPct} lamports={vrf} />
      </ul>
    </div>
  );
}

function Legend({
  swatch,
  label,
  pct,
  lamports,
}: {
  swatch: string;
  label: string;
  pct: number;
  lamports: bigint;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: swatch }}
      />
      <span className="text-neutral-300">
        {label}{" "}
        <span className="text-neutral-500">{pct.toFixed(2)}%</span>{" "}
        <span className="tabular-nums">{formatSol(lamports)}</span>
      </span>
    </li>
  );
}

// Cross-cutting risk feed. Pulls every flag surfaced by the users +
// pools aggregators into one prioritized stream, plus a few flags
// that only make sense in cross-pool aggregate (e.g. failed-VRF
// retries).
//
// Severity tiers:
//   high   = needs action now (stuck pool, suspected self-deal)
//   medium = worth a look (concentrated stake, big spender)
//   low    = informational (high activity, unclaimed wallet)

import "server-only";
import { aggregatePools } from "@/lib/admin/metrics/pools";
import { aggregateUsers } from "@/lib/admin/metrics/users";
import { loadSnapshot } from "@/lib/admin/snapshot";

export type RiskSeverity = "high" | "medium" | "low";
export type RiskKind =
  | "STUCK"
  | "CONCENTRATED_STAKE"
  | "SELF_DEAL_SUSPECT"
  | "EMPTY"
  | "HIGH_ACTIVITY"
  | "BIG_SPENDER"
  | "UNCLAIMED_HIGH_SPEND";

export interface RiskItem {
  /** Stable id so the UI can do row-level dedupe across refreshes. */
  id: string;
  kind: RiskKind;
  severity: RiskSeverity;
  /** Plain-English headline. */
  title: string;
  /** Detail string with the supporting numbers. */
  detail: string;
  /** Source domain — drives the deep-link target. */
  source: "pool" | "user";
  /** Pool address (when source = pool) or wallet (when source = user). */
  subjectId: string;
  /** Optional secondary subject (e.g. creator for self-deal flags). */
  relatedId?: string;
}

export interface RiskPayload {
  items: RiskItem[];
  totals: {
    high: number;
    medium: number;
    low: number;
    byKind: Partial<Record<RiskKind, number>>;
  };
  generatedAt: number;
}

const SEVERITY_BY_KIND: Record<RiskKind, RiskSeverity> = {
  STUCK: "high",
  SELF_DEAL_SUSPECT: "high",
  CONCENTRATED_STAKE: "medium",
  UNCLAIMED_HIGH_SPEND: "medium",
  BIG_SPENDER: "low",
  HIGH_ACTIVITY: "low",
  EMPTY: "low",
};

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export async function aggregateRisk(): Promise<RiskPayload> {
  const snap = await loadSnapshot();
  const [pools, users] = await Promise.all([
    aggregatePools(snap),
    aggregateUsers(snap),
  ]);

  const items: RiskItem[] = [];

  // Pool-derived flags.
  for (const p of pools.rows) {
    for (const flag of p.flags) {
      if (!isKnownKind(flag)) continue;
      const headline = headlineForPool(flag, p);
      items.push({
        id: `pool:${p.address}:${flag}`,
        kind: flag,
        severity: SEVERITY_BY_KIND[flag],
        title: headline.title,
        detail: headline.detail,
        source: "pool",
        subjectId: p.address,
        relatedId: p.creator,
      });
    }
  }

  // User-derived flags (filter out users with no flags to keep the
  // payload tight).
  for (const u of users.rows) {
    if (u.flags.length === 0) continue;
    for (const flag of u.flags) {
      if (!isKnownKind(flag)) continue;
      const headline = headlineForUser(flag, u);
      items.push({
        id: `user:${u.wallet}:${flag}`,
        kind: flag,
        severity: SEVERITY_BY_KIND[flag],
        title: headline.title,
        detail: headline.detail,
        source: "user",
        subjectId: u.wallet,
      });
    }
  }

  // Sort: severity asc (high first), then by kind name for stability.
  items.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.kind.localeCompare(b.kind);
  });

  const totals = {
    high: 0,
    medium: 0,
    low: 0,
    byKind: {} as Partial<Record<RiskKind, number>>,
  };
  for (const it of items) {
    totals[it.severity] += 1;
    totals.byKind[it.kind] = (totals.byKind[it.kind] ?? 0) + 1;
  }

  return { items, totals, generatedAt: snap.generatedAt };
}

// ───────────────────────────── helpers ───────────────────────────────

function isKnownKind(s: string): s is RiskKind {
  return s in SEVERITY_BY_KIND;
}

function headlineForPool(
  kind: RiskKind,
  p: Awaited<ReturnType<typeof aggregatePools>>["rows"][number],
): { title: string; detail: string } {
  const label =
    p.kind === "private"
      ? `Private pool ${shortish(p.address)}`
      : `${cadence(p.poolType)} #${p.round}`;
  switch (kind) {
    case "STUCK": {
      const ageMin = Math.floor(
        (Math.floor(Date.now() / 1000) - p.closeTimeUnix) / 60,
      );
      return {
        title: `Stuck pool — ${label}`,
        detail: `AwaitingVrf for ${ageMin}m · keeper retries may be exhausted`,
      };
    }
    case "CONCENTRATED_STAKE":
      return {
        title: `Concentrated stake — ${label}`,
        detail: `One participant owns >80% of tickets · self-deal possible`,
      };
    case "SELF_DEAL_SUSPECT":
      return {
        title: `Self-deal suspected — ${label}`,
        detail: `Creator owns ≥50% of tickets and won`,
      };
    case "EMPTY":
      return {
        title: `Empty private pool — ${label}`,
        detail: `Allocated invites but no tickets sold`,
      };
    default:
      return { title: `${kind} — ${label}`, detail: "" };
  }
}

function headlineForUser(
  kind: RiskKind,
  u: Awaited<ReturnType<typeof aggregateUsers>>["rows"][number],
): { title: string; detail: string } {
  const name = u.pseudo ?? shortish(u.wallet);
  switch (kind) {
    case "HIGH_ACTIVITY":
      return {
        title: `High activity — ${name}`,
        detail: `${u.pools} distinct pools · ${u.tickets} tickets lifetime`,
      };
    case "BIG_SPENDER":
      return {
        title: `Big spender — ${name}`,
        detail: `${(Number(u.spentLamports) / 1e9).toFixed(2)} SOL spent lifetime`,
      };
    case "UNCLAIMED_HIGH_SPEND":
      return {
        title: `Unclaimed wallet, heavy spend — ${shortish(u.wallet)}`,
        detail: `No profile claimed · ${(Number(u.spentLamports) / 1e9).toFixed(2)} SOL spent · possible bot`,
      };
    default:
      return { title: `${kind} — ${name}`, detail: "" };
  }
}

function shortish(addr: string): string {
  return addr.length < 12 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function cadence(t: number | undefined): string {
  switch (t) {
    case 0:
      return "WEEKLY";
    case 1:
      return "BIWEEKLY";
    case 2:
      return "TRIWEEKLY";
    case 3:
      return "MONTHLY";
    default:
      return "PUBLIC";
  }
}

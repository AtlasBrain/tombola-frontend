// src/app/api/r/og/winner/[pubkey]/route.tsx
//
// OG image for a settled raffle. Renders winner-specific content when
// pool.state === "Resolved" && pool.winner !== null. Falls back to a
// generic "pool closed" card when the pool hasn't settled yet.

import { ImageResponse } from "next/og";
import { getPoolTenant } from "@/lib/raas/pool-attribution";
import { getTenant } from "@/lib/raas/tenant";
import { fetchPoolState } from "@/lib/raas/pool-fetch";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;

  const attribution = await getPoolTenant(pubkey);
  const tenant = attribution ? await getTenant(attribution.tenant_slug) : null;
  const pool = await fetchPoolState(pubkey);

  const primary = tenant?.branding.primary_color ?? "#88cfc4";
  const tenantName = tenant ? tenant.display_name : "Tombola";

  const isWinnerKnown =
    pool !== null && pool.state === "Resolved" && pool.winner !== null;

  const winnerShort = isWinnerKnown
    ? pool.winner!.slice(0, 6) + "..." + pool.winner!.slice(-4)
    : "?";
  const potSol =
    pool !== null
      ? (Number(pool.total_pot_lamports) / 1e9).toFixed(2)
      : "0";

  const headline = isWinnerKnown
    ? `${tenantName} Raffle — Winner`
    : `${tenantName} Raffle`;

  const subline = isWinnerKnown
    ? `${potSol} SOL won by ${winnerShort}`
    : pool?.state === "AwaitingVrf"
    ? "Drawing in progress…"
    : "Raffle closed";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0e0e10",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand colour block */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: primary,
            marginBottom: 24,
          }}
        />

        {/* Trophy icon — Unicode, no external font required */}
        {isWinnerKnown && (
          <div style={{ fontSize: 48, marginBottom: 8 }}>&#127942;</div>
        )}

        <div style={{ fontSize: 56, fontWeight: 700, color: primary }}>
          {headline}
        </div>

        <div style={{ fontSize: 32, opacity: 0.8, marginTop: 16 }}>
          {subline}
        </div>

        {isWinnerKnown && (
          <div
            style={{
              marginTop: 24,
              padding: "8px 24px",
              borderRadius: 8,
              border: `2px solid ${primary}`,
              fontSize: 20,
              fontFamily: "monospace",
              opacity: 0.7,
            }}
          >
            {pool!.winner}
          </div>
        )}

        <div style={{ fontSize: 16, opacity: 0.35, marginTop: 40 }}>
          Powered by Tombola
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

// src/app/api/r/og/pool/[pubkey]/route.tsx
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

  const title = tenant ? `${tenant.display_name} Raffle` : "Tombola Raffle";
  const subtitle = pool
    ? `${(Number(pool.total_pot_lamports) / 1e9).toFixed(2)} SOL pot · ${pool.total_tickets} tickets`
    : "Tap in";
  const primary = tenant?.branding.primary_color ?? "#88cfc4";

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
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 16,
            background: primary,
            marginBottom: 24,
          }}
        />
        <div style={{ fontSize: 64, fontWeight: 700, color: primary }}>{title}</div>
        <div style={{ fontSize: 32, opacity: 0.7, marginTop: 12 }}>{subtitle}</div>
        <div style={{ fontSize: 18, opacity: 0.4, marginTop: 40 }}>
          Powered by Tombola
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

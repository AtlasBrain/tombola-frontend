"use client";

import { useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  tenantSlug: string;
  tenantPrimaryColor: string;
  onCreated: () => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurringScheduleForm({
  tenantSlug,
  tenantPrimaryColor,
  onCreated,
}: Props) {
  const signer = useUnifiedSigner();
  const [cadence, setCadence] = useState<
    "daily" | "weekly" | "biweekly" | "monthly"
  >("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(5); // Friday default
  const [hourUtc, setHourUtc] = useState(18);
  const [nameTemplate, setNameTemplate] = useState("Weekly Raffle #{n}");
  const [ticketPriceSol, setTicketPriceSol] = useState(0.05);
  const [durationSeconds, setDurationSeconds] = useState(86400);
  const [creatorFeeBps, setCreatorFeeBps] = useState(1500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!signer.publicKey || !signer.signMessage) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const context = `create_schedule:${tenantSlug}`;
      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=${encodeURIComponent(context)}`,
      );
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      const msg = `tombola:${context}:${nonce}`;
      const sigBytes = await signer.signMessage(new TextEncoder().encode(msg));
      const sigB58 = (await import("bs58")).default.encode(sigBytes);

      const res = await fetch(`/api/r/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          cadence,
          day_of_week:
            cadence === "weekly" || cadence === "biweekly" ? dayOfWeek : null,
          hour_utc: hourUtc,
          template: {
            name_template: nameTemplate,
            ticket_price_lamports: Math.round(ticketPriceSol * 1_000_000_000),
            duration_seconds: durationSeconds,
            creator_fee_bps: creatorFeeBps,
            gating_mode: "public",
            invite_count: null,
          },
          signed_proof: { signature: sigB58, nonce },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "create_failed");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">New schedule</h3>

      <label className="block">
        <span className="text-sm">Cadence</span>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as typeof cadence)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>

      {(cadence === "weekly" || cadence === "biweekly") && (
        <label className="block">
          <span className="text-sm">Day of week</span>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
            className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          >
            {DAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm">Hour (UTC)</span>
        <input
          type="number"
          min={0}
          max={23}
          value={hourUtc}
          onChange={(e) => setHourUtc(parseInt(e.target.value))}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">
          Raffle name template (use {"{n}"} for run number)
        </span>
        <input
          type="text"
          value={nameTemplate}
          onChange={(e) => setNameTemplate(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Ticket price (SOL)</span>
        <input
          type="number"
          step="0.001"
          value={ticketPriceSol}
          onChange={(e) => setTicketPriceSol(parseFloat(e.target.value))}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">Duration (seconds)</span>
        <input
          type="number"
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm">
          Your cut: {(creatorFeeBps / 100).toFixed(1)}%
        </span>
        <input
          type="range"
          min={0}
          max={3000}
          step={50}
          value={creatorFeeBps}
          onChange={(e) => setCreatorFeeBps(parseInt(e.target.value))}
          className="w-full"
        />
      </label>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 text-red-200 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting || !signer.publicKey}
        className="px-4 py-2 rounded-md font-semibold text-black disabled:opacity-30"
        style={{ background: tenantPrimaryColor }}
      >
        {submitting ? "Creating…" : "Create schedule"}
      </button>
    </div>
  );
}

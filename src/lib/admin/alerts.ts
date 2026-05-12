// Risk-flag alerting.
//
// Fires a webhook (Discord-compatible by default, also works for Slack
// and any generic JSON receiver) whenever a high-severity risk flag is
// observed. Per-flag dedupe key in Redis prevents the same flag from
// spamming the channel — re-alert only happens after the cooldown
// expires (6h by default).
//
// Configuration:
//   ADMIN_ALERT_WEBHOOK_URL   POST endpoint that accepts a JSON body.
//                              When unset, alerts are no-ops (this is
//                              the default — operators opt in by
//                              setting the env).
//   ADMIN_ALERT_DEDUPE_HOURS  Per-flag silence window. Default 6.
//
// Body shape:
//   { content: "...", embeds: [{ title, description, color }] }
// Discord ignores unknown fields; Slack's incoming-webhook accepts a
// "text" field — we set BOTH so the same env works for both vendors.

import "server-only";
import { getRedis } from "@/lib/kv/redis";

const ALERT_SENT_PREFIX = "alert-sent:";
const DEFAULT_DEDUPE_HOURS = 6;

export type AlertSeverity = "high" | "medium" | "low";

export interface AlertPayload {
  /** Stable identity for dedupe. Same flag → same id. */
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Deep-link URL admins can click. */
  url?: string;
}

const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  high: 0xe89999, // CORAL
  medium: 0xe8d89e, // SAND
  low: 0x88cfc4, // MINT
};

/** Public surface. Returns one of: "sent" (webhook fired), "deduped"
 *  (within cooldown), "no-config" (env not set), "no-kv" (Redis down),
 *  "failed" (webhook 4xx/5xx). */
export type AlertOutcome =
  | "sent"
  | "deduped"
  | "no-config"
  | "no-kv"
  | "failed";

export async function fireAlert(payload: AlertPayload): Promise<AlertOutcome> {
  const url = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!url) return "no-config";
  const r = getRedis();
  if (!r) return "no-kv";

  const dedupeHours = numEnv("ADMIN_ALERT_DEDUPE_HOURS", DEFAULT_DEDUPE_HOURS);
  const dedupeSec = Math.max(60, Math.floor(dedupeHours * 60 * 60));
  const dedupeKey = `${ALERT_SENT_PREFIX}${payload.id}`;

  // SETNX-with-EX pattern: only proceed if we successfully set the
  // dedupe key. This is the only path that fires the webhook, so two
  // concurrent cron runs can't double-send. Upstash's set(.., { nx,
  // ex }) gives us atomic SETNX+EXPIRE.
  let acquired = false;
  try {
    const result = await r.set(dedupeKey, Date.now(), {
      nx: true,
      ex: dedupeSec,
    });
    acquired = result === "OK";
  } catch {
    return "failed";
  }
  if (!acquired) return "deduped";

  // Build a vendor-agnostic body. Slack reads `text`; Discord reads
  // `content` + `embeds`. Generic receivers can use any of them.
  const sevPrefix =
    payload.severity === "high"
      ? "🚨"
      : payload.severity === "medium"
        ? "⚠️"
        : "ℹ️";
  const body = {
    text: `${sevPrefix} ${payload.title}\n${payload.detail}${payload.url ? `\n${payload.url}` : ""}`,
    content: `${sevPrefix} **${payload.title}**\n${payload.detail}${payload.url ? `\n${payload.url}` : ""}`,
    embeds: [
      {
        title: payload.title,
        description: payload.detail,
        color: SEVERITY_COLORS[payload.severity],
        url: payload.url,
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Surrender the dedupe key so the next pass can retry.
      try {
        await r.del(dedupeKey);
      } catch {
        // Best-effort.
      }
      return "failed";
    }
    return "sent";
  } catch {
    try {
      await r.del(dedupeKey);
    } catch {
      // Best-effort.
    }
    return "failed";
  }
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

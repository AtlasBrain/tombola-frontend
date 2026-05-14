// src/lib/raas/discord-webhook.ts — fire-and-forget Discord webhook helper.
// Server-only: never import this in client components.
import "server-only";

export interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  /** Decimal integer colour, e.g. 0x88cfc4 → 8966084 */
  color?: number;
  image?: { url: string };
  timestamp?: string; // ISO8601
}

/**
 * POST a message to a Discord Incoming Webhook URL.
 * Silently no-ops if webhookUrl is empty/null — callers don't need to guard.
 * Errors are swallowed: webhook delivery is best-effort; it must never break
 * the primary request flow.
 */
export async function postToDiscord(
  webhookUrl: string | null | undefined,
  payload: { content?: string; embeds?: DiscordEmbed[] },
): Promise<void> {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort — do not propagate Discord delivery failures.
  }
}

/** Convert a hex colour string (e.g. "#88cfc4") to a Discord decimal int. */
export function hexToDecimal(hex: string): number {
  return parseInt(hex.replace(/^#/, ""), 16);
}

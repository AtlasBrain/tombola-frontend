"use client";

/**
 * Top-of-page marquee. Client component — polls /api/recent-activity for
 * the most-recent on-chain BOUGHT (and eventually WON) events across
 * every live public pool. Falls back to a quiet "scanning" message when
 * no events are returned (fresh pool with no buys yet, RPC blip, etc.)
 * rather than rendering stale mock data.
 *
 * Marquee technique: a horizontal flex of items, duplicated once, inside
 * a `width: max-content` container animated with `translateX(-50%)` over
 * 60s (see `.ticker-track` in globals.css). The duplicate makes the
 * loop seamless.
 *
 * Refresh cadence: 30s. The server route in turn caches its result for
 * 20s, so worst-case staleness on screen is ~50s.
 */

import { useEffect, useState } from "react";
import { MINT, LAVENDER, CORAL, SAND } from "@/lib/colors";

interface ApiItem {
  kind: "bought" | "won";
  cadence: "Weekly" | "Biweekly" | "Triweekly" | "Monthly" | "private";
  text: string;
  blockTime: number;
}

const REFRESH_MS = 30_000;

const CADENCE_DOT: Record<ApiItem["cadence"], string> = {
  Weekly: LAVENDER,
  Biweekly: CORAL,
  Triweekly: MINT,
  Monthly: SAND,
  private: MINT,
};

function ItemRow({ items }: { items: ApiItem[] }) {
  return (
    <span className="flex gap-10">
      {items.map((item, i) => (
        <span key={`${item.text}-${i}`}>
          <span style={{ color: CADENCE_DOT[item.cadence] }}>●</span>{" "}
          {item.text}
        </span>
      ))}
    </span>
  );
}

export function Ticker() {
  const [items, setItems] = useState<ApiItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch("/api/recent-activity", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { items: ApiItem[] };
        if (cancelled) return;
        setItems(json.items);
      } catch {
        // Network blip — keep the previous frame on screen rather than
        // flashing the empty state.
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // First paint before /api responds: render a single subdued line. The
  // bar stays the same height so the page below doesn't shift when items
  // arrive.
  if (items === null) {
    return (
      <div className="border-b border-neutral-900/80 bg-black/95">
        <div className="overflow-hidden py-2.5 text-[11px] uppercase tracking-wider text-neutral-600">
          <div className="px-6 font-mono">SCANNING ON-CHAIN ACTIVITY…</div>
        </div>
      </div>
    );
  }

  // Genuine empty (RPC succeeded but no buys yet) — keep the bar so the
  // page doesn't suddenly shift up, but mark it explicitly so the user
  // doesn't think the ticker is broken.
  if (items.length === 0) {
    return (
      <div className="border-b border-neutral-900/80 bg-black/95">
        <div className="overflow-hidden py-2.5 text-[11px] uppercase tracking-wider text-neutral-600">
          <div className="px-6 font-mono">NO BUYS YET — BE THE FIRST</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-900/80 bg-black/95">
      <div className="overflow-hidden py-2.5 text-[11px] uppercase tracking-wider text-neutral-500">
        <div className="ticker-track flex gap-10 whitespace-nowrap font-mono">
          <ItemRow items={items} />
          {/* Duplicate row makes the translateX(-50%) loop seamless. */}
          <span aria-hidden="true">
            <ItemRow items={items} />
          </span>
        </div>
      </div>
    </div>
  );
}

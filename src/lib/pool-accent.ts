import type { PoolKind } from "@/lib/mock-pools";

/**
 * Maps a pool kind to the CSS custom property used as its accent color
 * across cards / tickers / progress bars / buttons.
 * Keep the mapping in one place so a palette swap is a one-line change.
 *
 * Note: PoolView uses `kind: PoolKind`, not `typeLabel`. The plan referenced
 * `typeLabel` but the actual type field is `kind` — adapted accordingly.
 */
export function accentForPool(label: PoolKind | string): string {
  switch (label) {
    case "Weekly":    return "var(--lavender)";
    case "Biweekly":  return "var(--mint)";
    case "Triweekly": return "var(--yellow)";
    case "Monthly":   return "var(--pink)";
    default:          return "var(--lavender)";
  }
}

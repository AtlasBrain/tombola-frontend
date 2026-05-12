/**
 * Floating icons for the /my-tickets page header.
 *
 * Layout principle: the page title + description occupy the LEFT half of
 * the header (max-w-md, anchored to start of the container). All icons live
 * in the RIGHT half + far-bottom strip so they decorate empty space without
 * fighting the headline.
 *
 * Sizing: ~h-24 cards (96px) + a few smaller decoration pieces. Bigger than
 * the homepage Hero icons because /my-tickets has a calmer page rhythm —
 * the icons can carry more visual weight here.
 *
 * Counts: 11 elements total (was 6). The float-a..f keyframes from globals.css
 * cycle so animations stay varied; we override animation-delay inline on the
 * extras to break sync. Hidden below md so they don't fight mobile content.
 */
export function MyTicketsFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      {/* ============ RIGHT-HALF CLUSTER (no text behind here) ============ */}

      {/* Top-right: SOL coin (large, primary) */}
      <div className="float-a absolute right-[4%] top-[8%] h-24 w-24 rounded-full border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="#88cfc4" />
          <g transform="translate(8 11)">
            <path d="M3 1 L23 1 L20 4 L0 4 Z"  fill="#0b0b0d" />
            <path d="M0 8 L20 8 L23 11 L3 11 Z" fill="#0b0b0d" />
            <path d="M3 15 L23 15 L20 18 L0 18 Z" fill="#0b0b0d" />
          </g>
        </svg>
      </div>

      {/* Inner-right: ticket #047 */}
      <div className="float-b absolute right-[18%] top-[18%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#c9b5dc]" aria-hidden>
          <path fill="currentColor" d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z" />
          <line x1="14" y1="14" x2="14" y2="34" stroke="#0b0b0d" strokeWidth="2" strokeDasharray="2 2" />
          <text x="22" y="26" fill="#0b0b0d" fontFamily="Space Mono" fontSize="9" fontWeight="700">047</text>
        </svg>
      </div>

      {/* Sparkle drift between coin + ticket */}
      <div
        className="float-c absolute right-[28%] top-[5%] h-14 w-14"
        style={{ animationDelay: "-2.4s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#e8d89e]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>

      {/* Mid-right: trophy (large) */}
      <div className="float-d absolute right-[6%] top-[42%] h-24 w-24 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#88cfc4]" aria-hidden>
          <path fill="currentColor" d="M14 8h12v8a6 6 0 0 1-12 0V8zM10 10h4v6H10zM26 10h4v6h-4zM18 22h4v6h-4zM14 28h12v3H14z" />
        </svg>
      </div>

      {/* Mid-right inner: dice (large) */}
      <div className="float-e absolute right-[20%] top-[50%] h-24 w-24 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#E89999" />
          <circle cx="14" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="20" cy="20" r="2.4" fill="#0b0b0d" />
          <circle cx="14" cy="26" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="26" r="2.4" fill="#0b0b0d" />
        </svg>
      </div>

      {/* Edge sparkle — far right between trophy and confetti */}
      <div
        className="float-f absolute right-[2%] top-[68%] h-12 w-12"
        style={{ animationDelay: "-1.6s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#c9b5dc]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>

      {/* Bottom-right: confetti burst (medium) */}
      <div className="float-a absolute right-[10%] top-[80%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40" style={{ animationDelay: "-3.5s" }}>
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <g strokeLinecap="round" strokeWidth="2.5" fill="none">
            <line x1="20" y1="20" x2="20" y2="6"  stroke="#c9b5dc" />
            <line x1="20" y1="20" x2="32" y2="10" stroke="#E89999" />
            <line x1="20" y1="20" x2="34" y2="20" stroke="#e8d89e" />
            <line x1="20" y1="20" x2="32" y2="32" stroke="#88cfc4" />
            <line x1="20" y1="20" x2="20" y2="34" stroke="#e8a5c0" />
            <line x1="20" y1="20" x2="8"  y2="32" stroke="#c9b5dc" />
            <line x1="20" y1="20" x2="6"  y2="20" stroke="#E89999" />
            <line x1="20" y1="20" x2="8"  y2="10" stroke="#e8d89e" />
          </g>
          <circle cx="20" cy="20" r="2" fill="#c9b5dc" />
        </svg>
      </div>

      {/* Bottom-far-right: small SOL coin (variant — different color) */}
      <div className="float-b absolute right-[28%] top-[85%] h-16 w-16 rounded-full border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/40" style={{ animationDelay: "-2.0s" }}>
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="#e8d89e" />
          <g transform="translate(8 11)">
            <path d="M3 1 L23 1 L20 4 L0 4 Z"  fill="#0b0b0d" />
            <path d="M0 8 L20 8 L23 11 L3 11 Z" fill="#0b0b0d" />
            <path d="M3 15 L23 15 L20 18 L0 18 Z" fill="#0b0b0d" />
          </g>
        </svg>
      </div>

      {/* ============ FAR-BOTTOM STRIP (under text content) ============ */}

      {/* Bottom-left: small ticket (sits BELOW the description text bounds) */}
      <div
        className="float-c absolute left-[8%] top-[92%] h-16 w-16 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/40"
        style={{ animationDelay: "-4.0s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#88cfc4]" aria-hidden>
          <path fill="currentColor" d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z" />
          <line x1="14" y1="14" x2="14" y2="34" stroke="#0b0b0d" strokeWidth="2" strokeDasharray="2 2" />
          <text x="22" y="26" fill="#0b0b0d" fontFamily="Space Mono" fontSize="9" fontWeight="700">012</text>
        </svg>
      </div>

      {/* Bottom-mid: small dice variant */}
      <div
        className="float-d absolute left-[35%] top-[92%] h-14 w-14 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/40"
        style={{ animationDelay: "-5.5s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#c9b5dc" />
          <circle cx="14" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="20" cy="20" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="26" r="2.4" fill="#0b0b0d" />
        </svg>
      </div>

      {/* Bottom-mid sparkle filler */}
      <div
        className="float-e absolute left-[55%] top-[88%] h-12 w-12"
        style={{ animationDelay: "-3.0s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#E89999]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>
    </div>
  );
}

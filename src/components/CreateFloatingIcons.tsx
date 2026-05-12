/**
 * Floating icons for the /create page header. Mirrors the
 * MyTicketsFloatingIcons / HeroFloatingIcons pattern.
 *
 * Theme: pool creation / invite codes. Key + ticket + sparkle + dice +
 * QR-code grid + SOL coin + confetti. Mint anchors the page (private
 * pools are mint per design system) but other accents appear so the
 * cluster matches the brand palette.
 *
 * Hidden below md so they don't fight mobile content.
 */
export function CreateFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      {/* ============ RIGHT-HALF CLUSTER ============ */}

      {/* Top-right: KEY (private invite — mint, primary) */}
      <div className="float-a absolute right-[4%] top-[10%] h-24 w-24 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#88cfc4]" aria-hidden>
          <circle cx="13" cy="20" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="13" cy="20" r="2.2" fill="currentColor" />
          <line x1="20" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="29" y1="20" x2="29" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="33" y1="20" x2="33" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Inner-right: ticket (lavender — invite link metaphor) */}
      <div className="float-b absolute right-[18%] top-[18%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#c9b5dc]" aria-hidden>
          <path fill="currentColor" d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z" />
          <line x1="14" y1="14" x2="14" y2="34" stroke="#0b0b0d" strokeWidth="2" strokeDasharray="2 2" />
          <text x="22" y="26" fill="#0b0b0d" fontFamily="Space Mono" fontSize="9" fontWeight="700">x10</text>
        </svg>
      </div>

      {/* Top sparkle filler */}
      <div
        className="float-c absolute right-[28%] top-[5%] h-14 w-14"
        style={{ animationDelay: "-2.4s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#e8d89e]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>

      {/* Mid-right: QR-code grid (codes are bearer tokens) */}
      <div className="float-d absolute right-[7%] top-[40%] h-24 w-24 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <rect x="6" y="6" width="10" height="10" rx="1.5" fill="#88cfc4" />
          <rect x="9" y="9" width="4" height="4" rx="0.5" fill="#0b0b0d" />
          <rect x="24" y="6" width="10" height="10" rx="1.5" fill="#88cfc4" />
          <rect x="27" y="9" width="4" height="4" rx="0.5" fill="#0b0b0d" />
          <rect x="6" y="24" width="10" height="10" rx="1.5" fill="#88cfc4" />
          <rect x="9" y="27" width="4" height="4" rx="0.5" fill="#0b0b0d" />
          {/* scattered modules */}
          <rect x="20" y="20" width="3" height="3" fill="#88cfc4" />
          <rect x="25" y="22" width="3" height="3" fill="#88cfc4" />
          <rect x="29" y="25" width="3" height="3" fill="#88cfc4" />
          <rect x="20" y="28" width="3" height="3" fill="#88cfc4" />
          <rect x="25" y="30" width="3" height="3" fill="#88cfc4" />
          <rect x="32" y="20" width="3" height="3" fill="#88cfc4" />
          <rect x="20" y="14" width="3" height="3" fill="#88cfc4" />
        </svg>
      </div>

      {/* Mid-right inner: dice (large) */}
      <div className="float-e absolute right-[22%] top-[45%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#E89999" />
          <circle cx="14" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="20" cy="20" r="2.4" fill="#0b0b0d" />
          <circle cx="14" cy="26" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="26" r="2.4" fill="#0b0b0d" />
        </svg>
      </div>

      {/* Edge sparkle right of dice */}
      <div
        className="float-f absolute right-[3%] top-[68%] h-12 w-12"
        style={{ animationDelay: "-1.6s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#c9b5dc]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>

      {/* Bottom-right: SOL coin */}
      <div
        className="float-a absolute right-[12%] top-[78%] h-20 w-20 rounded-full border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40"
        style={{ animationDelay: "-3.5s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="#e8d89e" />
          <g transform="translate(8 11)">
            <path d="M3 1 L23 1 L20 4 L0 4 Z"  fill="#0b0b0d" />
            <path d="M0 8 L20 8 L23 11 L3 11 Z" fill="#0b0b0d" />
            <path d="M3 15 L23 15 L20 18 L0 18 Z" fill="#0b0b0d" />
          </g>
        </svg>
      </div>

      {/* Bottom-far-right: confetti */}
      <div
        className="float-b absolute right-[28%] top-[83%] h-16 w-16"
        style={{ animationDelay: "-2.0s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <g strokeLinecap="round" strokeWidth="2.5" fill="none">
            <line x1="20" y1="20" x2="20" y2="6"  stroke="#c9b5dc" />
            <line x1="20" y1="20" x2="32" y2="10" stroke="#E89999" />
            <line x1="20" y1="20" x2="34" y2="20" stroke="#e8d89e" />
            <line x1="20" y1="20" x2="32" y2="32" stroke="#88cfc4" />
            <line x1="20" y1="20" x2="20" y2="34" stroke="#e8a5c0" />
            <line x1="20" y1="20" x2="8"  y2="32" stroke="#c9b5dc" />
          </g>
          <circle cx="20" cy="20" r="2" fill="#88cfc4" />
        </svg>
      </div>

      {/* ============ FAR-BOTTOM STRIP (under text content) ============ */}

      {/* Bottom-left: small key (sits below description) */}
      <div
        className="float-c absolute left-[8%] top-[92%] h-16 w-16 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/40"
        style={{ animationDelay: "-4.0s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#c9b5dc]" aria-hidden>
          <circle cx="13" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="13" cy="20" r="1.8" fill="currentColor" />
          <line x1="19" y1="20" x2="32" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="20" x2="28" y2="25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Bottom-mid: small ticket variant */}
      <div
        className="float-d absolute left-[35%] top-[92%] h-14 w-14 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-lg shadow-black/40"
        style={{ animationDelay: "-5.5s" }}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#88cfc4]" aria-hidden>
          <path fill="currentColor" d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z" />
          <line x1="14" y1="14" x2="14" y2="34" stroke="#0b0b0d" strokeWidth="2" strokeDasharray="2 2" />
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

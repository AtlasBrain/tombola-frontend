/**
 * Six floating icons around the hero — exact port from
 * public/redesign-v1-recolored.html lines 401-475. Server component.
 *
 * Hidden below md per mockup. Each icon has its own keyframe so the
 * cluster feels alive without obvious sync (sparkle is the bare icon,
 * the other 5 sit in dark cards).
 */
export function HeroFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden md:block">
      {/* LEFT: ticket #047 */}
      <div className="float-a absolute left-[5%] top-[24%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-lime" aria-hidden>
          <path fill="currentColor" d="M5 12h30v6a3 3 0 0 0 0 6v6H5v-6a3 3 0 0 0 0-6v-6z" />
          <line x1="14" y1="14" x2="14" y2="34" stroke="#0b0b0d" strokeWidth="2" strokeDasharray="2 2" />
          <text x="22" y="26" fill="#0b0b0d" fontFamily="Space Mono" fontSize="9" fontWeight="700">047</text>
        </svg>
      </div>

      {/* LEFT: dice */}
      <div className="float-b absolute left-[9%] top-[55%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#E89999" />
          <circle cx="14" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="14" r="2.4" fill="#0b0b0d" />
          <circle cx="20" cy="20" r="2.4" fill="#0b0b0d" />
          <circle cx="14" cy="26" r="2.4" fill="#0b0b0d" />
          <circle cx="26" cy="26" r="2.4" fill="#0b0b0d" />
        </svg>
      </div>

      {/* LEFT: sparkle (no card wrapper) */}
      <div className="float-c absolute left-[3%] top-[80%] h-16 w-16">
        <svg viewBox="0 0 40 40" className="h-full w-full text-[#e8d89e]" aria-hidden>
          <path fill="currentColor" d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" />
        </svg>
      </div>

      {/* RIGHT: Solana coin */}
      <div className="float-d absolute right-[5%] top-[18%] h-20 w-20 rounded-full border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="#88cfc4" />
          <g transform="translate(8 11)">
            <path d="M3 1 L23 1 L20 4 L0 4 Z"  fill="#0b0b0d" />
            <path d="M0 8 L20 8 L23 11 L3 11 Z" fill="#0b0b0d" />
            <path d="M3 15 L23 15 L20 18 L0 18 Z" fill="#0b0b0d" />
          </g>
        </svg>
      </div>

      {/* RIGHT: trophy */}
      <div className="float-e absolute right-[9%] top-[52%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
        <svg viewBox="0 0 40 40" className="h-full w-full text-lime" aria-hidden>
          <path fill="currentColor" d="M14 8h12v8a6 6 0 0 1-12 0V8zM10 10h4v6H10zM26 10h4v6h-4zM18 22h4v6h-4zM14 28h12v3H14z" />
        </svg>
      </div>

      {/* RIGHT: confetti burst */}
      <div className="float-f absolute right-[4%] top-[80%] h-20 w-20 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 shadow-lg shadow-black/40">
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
          <rect x="3"  y="3"  width="3" height="3" rx="0.5" fill="#c9b5dc" transform="rotate(20 4.5 4.5)" />
          <rect x="34" y="4"  width="3" height="3" rx="0.5" fill="#E89999" transform="rotate(-15 35.5 5.5)" />
          <rect x="35" y="34" width="3" height="3" rx="0.5" fill="#88cfc4" transform="rotate(30 36.5 35.5)" />
          <rect x="3"  y="35" width="3" height="3" rx="0.5" fill="#e8a5c0" transform="rotate(-25 4.5 36.5)" />
          <circle cx="20" cy="20" r="2" fill="#c9b5dc" />
        </svg>
      </div>
    </div>
  );
}

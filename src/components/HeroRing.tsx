/**
 * Multi-layer hero ring — exact port of the mockup's SVG
 * (public/redesign-v1-recolored.html lines 478-530). Server component;
 * pure SVG + class-driven animation.
 *
 * Four layers, three rotation speeds:
 *   - .spin-slow   r=490 outer hairline (linearGradient)
 *   - .spin-counter r=465 main band + 4 colored compass dots
 *   - .spin-fast   r=478 dashed comet trail (stroke-dasharray flow)
 *   - .spin-slow   r=448 inner hairline
 *
 * Sized via Tailwind on the wrapper (520→600→680 across breakpoints
 * per mockup).
 */
export function HeroRing() {
  return (
    <svg
      viewBox="0 0 1000 1000"
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 sm:h-[600px] sm:w-[600px] lg:h-[680px] lg:w-[680px]"
      aria-hidden
    >
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#c9b5dc" />
          <stop offset="33%"  stopColor="#b8a5d4" />
          <stop offset="66%"  stopColor="#e8d89e" />
          <stop offset="100%" stopColor="#88cfc4" />
        </linearGradient>
      </defs>

      {/* Outer hairline — slow + */}
      <g className="spin-slow" style={{ transformOrigin: "500px 500px" }}>
        <circle cx="500" cy="500" r="490" stroke="url(#ringGrad)" strokeWidth="1" fill="none" opacity="0.5" />
      </g>

      {/* Main thin band, counter-rotating, with 4 color dots at compass points */}
      <g className="spin-counter" style={{ transformOrigin: "500px 500px" }}>
        <circle cx="500" cy="500" r="465" stroke="url(#ringGrad)" strokeWidth="6" fill="none" opacity="0.5" />
        <circle cx="500" cy="35"  r="6" fill="#c9b5dc" />
        <circle cx="965" cy="500" r="6" fill="#b8a5d4" />
        <circle cx="500" cy="965" r="6" fill="#e8d89e" />
        <circle cx="35"  cy="500" r="6" fill="#88cfc4" />
      </g>

      {/* Dashed comet trail — fast spin, single 40-unit lit arc travels round
          on a pathLength=3000 perimeter. */}
      <g className="spin-fast" style={{ transformOrigin: "500px 500px" }}>
        <circle
          cx="500" cy="500" r="478"
          stroke="#c9b5dc"
          strokeWidth="2"
          fill="none"
          opacity="0.85"
          strokeDasharray="40 2960"
          strokeLinecap="round"
          pathLength={3000}
        />
      </g>

      {/* Inner hairline — slow + */}
      <g className="spin-slow" style={{ transformOrigin: "500px 500px" }}>
        <circle cx="500" cy="500" r="448" stroke="url(#ringGrad)" strokeWidth="1" fill="none" opacity="0.4" />
      </g>
    </svg>
  );
}

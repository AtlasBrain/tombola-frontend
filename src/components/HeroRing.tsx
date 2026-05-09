/**
 * Multi-layer rotating ring centered behind the hero headline.
 * Four `<g>` layers each spin at a different speed:
 *   - .spin-slow    50s — outermost dotted band
 *   - .spin-counter 35s — counter-spinning thin arc with comet
 *   - .spin-fast    20s — comet head (single bright dash)
 *   - static        — hairlines that anchor the eye
 *
 * Server component — pure SVG + className-driven CSS animation,
 * no React state.
 *
 * Sized via the `size` prop (px). Mockup uses ~520 on desktop, ~360
 * on mobile (controlled by Tailwind responsive class on the parent).
 */
export function HeroRing({ size = 520 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute inset-0 mx-auto"
      aria-hidden
    >
      {/* Static outer hairline */}
      <circle cx={cx} cy={cy} r={cx - 6}  fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Static inner hairline */}
      <circle cx={cx} cy={cy} r={cx - 24} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* Dashed counter-spin band — sits between the hairlines */}
      <g className="spin-counter" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle
          cx={cx} cy={cy} r={cx - 14}
          fill="none"
          stroke="rgba(201,181,220,0.4)"
          strokeWidth="1.5"
          strokeDasharray="2 8"
        />
      </g>

      {/* Slow forward spin — single bright comet dash */}
      <g className="spin-slow" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle
          cx={cx} cy={cy} r={cx - 14}
          fill="none"
          stroke="var(--lavender)"
          strokeWidth="2"
          strokeDasharray={`${size * 0.04} ${size * 5}`}
          strokeLinecap="round"
        />
      </g>

      {/* Fast forward spin — small accent dot orbiting */}
      <g className="spin-fast" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={6 + 14} r="3" fill="var(--mint)" />
      </g>

      {/* 4 pool pips at compass points (no rotation) */}
      <circle cx={cx} cy={cy - (cx - 14)} r="2.5" fill="var(--lavender)" />
      <circle cx={cx + (cx - 14)} cy={cy} r="2.5" fill="var(--mint)" />
      <circle cx={cx} cy={cy + (cx - 14)} r="2.5" fill="var(--yellow)" />
      <circle cx={cx - (cx - 14)} cy={cy} r="2.5" fill="var(--pink)" />
    </svg>
  );
}

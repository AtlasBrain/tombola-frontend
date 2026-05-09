/**
 * Six floating SVG icons positioned around the hero ring on lg+ screens.
 * Each icon has its own `.float-a..f` keyframe (different timings +
 * amplitudes) so the cluster feels alive without obvious sync.
 *
 * Hidden below `lg` (mockup pattern — they crowd small screens).
 */
import type { ReactNode } from "react";

type FloatingIconProps = {
  position: string;          // tailwind absolute classes
  animation: "a" | "b" | "c" | "d" | "e" | "f";
  children: ReactNode;
};

function FloatingIcon({ position, animation, children }: FloatingIconProps) {
  return (
    <div
      className={`hidden lg:flex absolute ${position} float-${animation} h-14 w-14 items-center justify-center rounded-2xl bg-[#1f1f24] ring-1 ring-white/10 shadow-xl shadow-black/40`}
    >
      {children}
    </div>
  );
}

export function HeroFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <FloatingIcon position="left-[8%] top-[18%]" animation="a">
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--lavender)" }}>
          <rect x="6" y="12" width="28" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="12" x2="20" y2="28" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" />
          <text x="13" y="24" fontSize="7" fontFamily="monospace" fill="currentColor">047</text>
        </svg>
      </FloatingIcon>

      <FloatingIcon position="left-[6%] top-[48%]" animation="b">
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--mint)" }}>
          <rect x="8" y="8" width="24" height="24" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="14" cy="14" r="1.6" fill="currentColor" />
          <circle cx="20" cy="20" r="1.6" fill="currentColor" />
          <circle cx="26" cy="26" r="1.6" fill="currentColor" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="left-[4%] top-[78%]" animation="c">
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--yellow)" }}>
          <path d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z" fill="currentColor" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="right-[8%] top-[18%]" animation="d">
        <svg viewBox="0 0 40 40" className="h-7 w-7">
          <path d="M9 12 L29 12 L33 16 L13 16 Z" fill="var(--lavender)" />
          <path d="M9 18 L29 18 L33 22 L13 22 Z" fill="var(--mint)" />
          <path d="M9 24 L29 24 L33 28 L13 28 Z" fill="var(--pink)" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="right-[6%] top-[48%]" animation="e">
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--lavender)" }}>
          <path d="M14 8 H26 V18 a6 6 0 0 1 -12 0 Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="20" y1="24" x2="20" y2="30" stroke="currentColor" strokeWidth="2" />
          <line x1="14" y1="32" x2="26" y2="32" stroke="currentColor" strokeWidth="2" />
        </svg>
      </FloatingIcon>

      <FloatingIcon position="right-[4%] top-[78%]" animation="f">
        <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ color: "var(--pink)" }}>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <line
              key={deg}
              x1="20" y1="20" x2="20" y2="8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${deg} 20 20)`}
            />
          ))}
          <circle cx="20" cy="20" r="3" fill="currentColor" />
        </svg>
      </FloatingIcon>
    </div>
  );
}

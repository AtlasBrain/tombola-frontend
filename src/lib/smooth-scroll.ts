/**
 * Cubic ease-in-out — matches public/redesign-v1-recolored.html's
 * scroll JS exactly. Defined as a pure function so we can unit-test
 * the curve (no DOM needed).
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smoothly scrolls window.scrollY to `targetY` over `duration` ms using
 * easeInOutCubic. The browser's CSS `scroll-behavior: smooth` is too
 * fast (~400 ms) and exposes no duration knob; this rolls our own.
 *
 * Calls `window.scrollTo({ top })` on each rAF tick. No-ops in SSR
 * (typeof window === "undefined").
 */
export function smoothScrollTo(targetY: number, duration = 1100): void {
  if (typeof window === "undefined") return;
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now: number): void {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(t);
    window.scrollTo({ top: startY + distance * eased });
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Scrolls to a section by id, with a 32px breathing offset.
 * Used by Hero + Header nav onClick handlers.
 */
export function smoothScrollToId(id: string, duration = 1100): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const targetY = el.getBoundingClientRect().top + window.scrollY - 32;
  smoothScrollTo(targetY, duration);
}

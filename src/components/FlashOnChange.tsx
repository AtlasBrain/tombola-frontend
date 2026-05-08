"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Stable identity — when this changes, the children flash amber briefly. */
  value: string;
  /** How long to hold the highlight before transitioning back (ms). */
  durationMs?: number;
  children: ReactNode;
}

/**
 * Wrap a frequently-changing display value in this and its color flashes
 * amber whenever the underlying value mutates. Uses Tailwind's
 * `transition-colors` so the flash fades in and out (~700 ms each side).
 *
 * Doesn't fire on initial mount — only on subsequent value changes.
 */
export function FlashOnChange({ value, durationMs = 1200, children }: Props) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), durationMs);
    return () => clearTimeout(t);
  }, [value, durationMs]);

  return (
    <span
      className={`transition-colors duration-700 ${flash ? "text-amber-300" : ""}`}
    >
      {children}
    </span>
  );
}

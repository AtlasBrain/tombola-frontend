"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

/**
 * Live-updating countdown to a unix-seconds timestamp. Re-renders every
 * second. Marked "use client" because `useEffect` runs in the browser only.
 */
export function Countdown({ targetUnix }: { targetUnix: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  return <span>{formatCountdown(targetUnix, now)}</span>;
}

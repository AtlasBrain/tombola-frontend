"use client";

// Unified close (×) affordance for every modal/drawer. Lock-in from the
// 2026-05-12 UI audit: pick ONE pattern across the app — small circular
// × icon at top-right + esc handled by the parent dialog.
//
// Pill buttons labeled "Cancel" / "Done" / "Close" are no longer used
// for dismiss. Footer pills are reserved for primary commits (Save,
// Done success-state) and use Button.tsx.

import { forwardRef } from "react";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — defaults to "Close" but parents can override
   *  ("Close friends list", "Dismiss search") for screen readers. */
  label?: string;
}

export const CloseButton = forwardRef<HTMLButtonElement, Props>(
  function CloseButton({ label = "Close", className = "", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-300 transition hover:border-neutral-600 hover:text-neutral-100 ${className}`.trim()}
        {...rest}
      >
        ×
      </button>
    );
  },
);

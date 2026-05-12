"use client";

// Canonical button hierarchy. Use one of the named variants below
// instead of hand-rolling a `rounded-full px-X py-Y bg-... text-...`
// string each time. The variant encodes intent:
//
//   cta        — major transactional action that spends SOL or signs
//                an on-chain tx. Tear-corner shape, mint fill. Reserve
//                for "Buy ticket", "Create pool", "Redeem", etc.
//   primary    — action that signs an off-chain message (friend
//                request, profile save, etc.) OR a single emphasized
//                action on the surface. Mint pill.
//   secondary  — passive action: navigation, "Set up profile", a
//                non-destructive option. Mint outline pill.
//   tertiary   — quiet action: cancel, skip, decline, dismiss. Bare
//                outline pill on dark surface.
//   danger     — destructive action: revoke, delete, clear. Coral
//                outline pill; full fill on confirm-state.
//
// Sizes:
//   sm   — inline action buttons (~24-28px tall)
//   md   — default (~36px)
//   lg   — major CTA on hero / form-submit (~48px)
//
// Migration: replace ad-hoc `rounded-full bg-[MINT] text-black ...`
// with <Button variant="primary">. CSS pillars (rounded-full, font-mono
// uppercase tracking-widest) are baked in; size variants control
// padding only.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "cta"
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional trailing icon — e.g. an arrow. Rendered as a circle
   *  chip on `cta` variant to match the existing tear-corner pattern. */
  trailing?: ReactNode;
  children: ReactNode;
}

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-[9px]",
  md: "px-4 py-1.5 text-[10px]",
  lg: "px-5 py-2.5 text-xs",
};

const VARIANT: Record<ButtonVariant, string> = {
  // The CTA uses the existing `btn-fx fx-tear` utility class from
  // globals.css to keep the tear-corner clip-path animation intact.
  // The inline --tear-bg var drives the mint fill.
  cta:
    "btn-fx fx-tear text-black font-display tracking-widest hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
  primary:
    "rounded-full bg-mint text-black font-bold tracking-widest border border-transparent hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 transition",
  secondary:
    "rounded-full bg-transparent text-mint border border-mint/50 hover:bg-mint/10 hover:border-mint disabled:cursor-not-allowed disabled:opacity-60 transition tracking-widest",
  tertiary:
    "rounded-full bg-transparent text-neutral-300 border border-neutral-800 hover:border-neutral-600 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 transition tracking-widest",
  danger:
    "rounded-full bg-transparent text-coral border border-coral/50 hover:bg-coral/10 hover:border-coral disabled:cursor-not-allowed disabled:opacity-60 transition tracking-widest",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", trailing, className, children, style, ...rest },
  ref,
) {
  const base = "inline-flex items-center justify-center gap-2 font-mono uppercase whitespace-nowrap";
  const ctaStyle =
    variant === "cta"
      ? ({ ["--tear-bg" as never]: "var(--mint)" } as React.CSSProperties)
      : undefined;
  return (
    <button
      ref={ref}
      {...rest}
      style={{ ...ctaStyle, ...style }}
      className={`${base} ${SIZE[size]} ${VARIANT[variant]} ${className ?? ""}`}
    >
      {children}
      {trailing && (
        <span
          aria-hidden
          className={
            variant === "cta"
              ? "chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-mint text-xs"
              : ""
          }
        >
          {trailing}
        </span>
      )}
    </button>
  );
});

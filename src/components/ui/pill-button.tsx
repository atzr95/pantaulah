"use client";

import type { ButtonHTMLAttributes } from "react";

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected/highlighted state */
  active?: boolean;
  /** Solid blurred backdrop for pills floating above the map */
  overlay?: boolean;
}

/**
 * Shared selectable pill: category tabs, metric toggles, quick-select chips.
 * Full 44px touch target on small screens, compact on desktop.
 */
export default function PillButton({
  active = false,
  overlay = false,
  className = "",
  children,
  ...rest
}: PillButtonProps) {
  const stateClasses = active
    ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_10px_rgba(0,212,255,0.1)]"
    : `border-[var(--color-border-mid)] text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] cursor-pointer ${
        overlay ? "bg-[rgba(10,10,15,0.7)] backdrop-blur-sm" : ""
      }`;

  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`px-2.5 py-2 min-h-[44px] lg:py-1 lg:min-h-0 text-[11px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${stateClasses} ${className}`}
    >
      {children}
    </button>
  );
}

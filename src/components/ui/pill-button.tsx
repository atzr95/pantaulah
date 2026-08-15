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
    ? "bg-[var(--color-cyan-soft)] border-[var(--color-cyan)] text-[var(--color-text-bright)]"
    : `border-[var(--color-border-mid)] text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] cursor-pointer ${
        overlay ? "bg-[rgba(13,24,30,0.88)] backdrop-blur-sm" : ""
      }`;

  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`px-3 py-2 min-h-[44px] lg:py-2 lg:min-h-9 text-xs font-semibold tracking-[0.04em] border rounded-md transition-colors whitespace-nowrap shrink-0 ${stateClasses} ${className}`}
    >
      {children}
    </button>
  );
}

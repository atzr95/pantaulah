"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
  /** Dim text after the label, e.g. a count */
  hint?: string;
}

/**
 * The app's menu select (use instead of a native <select>). The trigger is the
 * same box as PillButton so it sits in a pill row. The list floats above
 * everything (bottom sheet included), opens upward when there is no room below,
 * and closes on an outside press, Escape, scroll or resize without blocking the
 * controls around it.
 */
export default function Dropdown({
  label,
  value,
  options,
  onChange,
  active = false,
  align = "left",
  className = "",
}: {
  /** Accessible name, e.g. "Filter by state" */
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Cyan trigger, e.g. when a filter is on */
  active?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [listStyle, setListStyle] = useState<CSSProperties | null>(null);
  const open = listStyle !== null;
  const setOpen = (next: boolean) => setListStyle(next ? placeList() : null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  // Fixed position from the trigger; flips up when less than 200px is free below
  function placeList(): CSSProperties | null {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return null;
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 200 && above > below;
    return {
      minWidth: r.width,
      maxHeight: Math.min(288, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      ...(align === "right" ? { right: window.innerWidth - r.right } : { left: r.left }),
    };
  }

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      rootRef.current?.contains(t as Node) || listRef.current?.contains(t as Node);
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) setListStyle(null);
    };
    // A fixed list would drift away from its trigger, so close instead
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setListStyle(null);
    };
    const onResize = () => setListStyle(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    // Start keyboard users on the chosen option
    listRef.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"], [role="option"]')
      ?.focus({ preventScroll: true });
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown" ? items[Math.min(i + 1, items.length - 1)]
      : e.key === "ArrowUp" ? items[Math.max(i - 1, 0)]
      : e.key === "Home" ? items[0]
      : e.key === "End" ? items.at(-1)
      : null;
    if (next) {
      e.preventDefault();
      next.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Back on the trigger first, so the browser's Tab continues from there
      close();
    }
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 min-h-[44px] lg:min-h-9 text-xs font-semibold tracking-[0.04em] border rounded-md transition-colors whitespace-nowrap cursor-pointer ${
          active || open
            ? "bg-[var(--color-cyan-soft)] border-[var(--color-cyan)] text-[var(--color-text-bright)]"
            : "bg-[rgba(13,24,30,0.88)] backdrop-blur-sm border-[var(--color-border-mid)] text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
        }`}
      >
        <span className="truncate">{current?.label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className={`w-2.5 h-1.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {listStyle && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
          style={listStyle}
          className="fixed z-50 w-max max-w-[min(18rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-md border border-[var(--color-border-mid)] bg-[var(--color-bg-panel)] py-1"
        >
          {options.map((o) => {
            const selected = o.value === current?.value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
                className={`flex w-full items-center gap-3 px-3 min-h-[44px] lg:min-h-9 text-left text-xs tracking-[0.04em] transition-colors cursor-pointer ${
                  selected
                    ? "bg-[var(--color-cyan-soft)] text-[var(--color-text-bright)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-text)]"
                }`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 font-mono text-[var(--color-text-dim)]">{o.hint}</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

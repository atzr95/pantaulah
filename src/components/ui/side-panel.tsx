import type { ReactNode } from "react";

/** Desktop right panel: same width, surface and border on every tab. Below lg the bottom sheet takes over. */
export function SidePanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className="w-[400px] hidden lg:flex flex-col overflow-y-auto shrink-0 border-l border-[var(--color-border-mid)]"
      style={{ background: "linear-gradient(180deg, var(--color-bg-panel) 0%, var(--color-bg) 100%)" }}
    >
      {children}
    </aside>
  );
}

interface HeaderProps {
  /** Cyan context line, e.g. "NATIONAL OVERVIEW" */
  eyebrow: string;
  /** Dim text after the slash, e.g. "ECONOMY" */
  context?: string;
  title: string;
  flagSrc?: string;
}

function Flag({ src, title, className }: { src: string; title: string; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${title} flag`}
      className={`${className} object-cover rounded-sm shrink-0`}
      style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
    />
  );
}

/** Top of every side panel: "EYEBROW / CONTEXT", optional flag, title, subtitle. */
export function PanelHeader({ eyebrow, context, title, flagSrc, subtitle }: HeaderProps & { subtitle?: ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-[var(--color-border)]">
      <div className="text-xs tracking-[0.08em] text-[var(--color-cyan)] mb-1">
        {eyebrow}
        {context && <span className="text-[var(--color-text-dim)] ml-2">/ {context}</span>}
      </div>
      <h2 className="text-[22px] font-bold text-[var(--color-text-bright)] tracking-[0.02em] flex items-center gap-3 min-w-0">
        {flagSrc && <Flag src={flagSrc} title={title} className="w-8 h-5" />}
        <span className="truncate">{title}</span>
      </h2>
      {subtitle && <div className="text-xs text-[var(--color-text-dim)] mt-0.5">{subtitle}</div>}
    </div>
  );
}

/** The same header as one row, for a bottom sheet's peek. `aside` sits on the right (e.g. warning counts). */
export function PeekHeader({ eyebrow, context, title, flagSrc, aside }: HeaderProps & { aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {flagSrc && <Flag src={flagSrc} title={title} className="w-7 h-4.5" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--color-text-bright)] tracking-wider truncate">{title}</div>
        <div className="text-xs tracking-[0.06em] text-[var(--color-text-dim)] truncate">
          {eyebrow}
          {context && ` / ${context}`}
        </div>
      </div>
      {aside && <div className="shrink-0 text-right">{aside}</div>}
    </div>
  );
}

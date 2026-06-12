interface EmptyStateProps {
  /** Decorative leading glyph (emoji or symbol) */
  icon?: string;
  title: string;
  detail?: string;
  /** "positive" renders the title in green (all-clear style) */
  tone?: "positive" | "neutral";
  className?: string;
}

/** Shared empty/all-clear card so every panel speaks the same language */
export default function EmptyState({
  icon,
  title,
  detail,
  tone = "neutral",
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`border border-[var(--color-border)] rounded-sm p-4 text-center ${className}`}
      style={{ background: "rgba(13, 13, 20, 0.8)" }}
    >
      {icon && (
        <div className="text-sm mb-1" aria-hidden="true">
          {icon}
        </div>
      )}
      <div
        className={`text-sm mb-0.5 ${
          tone === "positive"
            ? "text-[var(--color-green)]"
            : "text-[var(--color-text-muted)]"
        }`}
      >
        {title}
      </div>
      {detail && (
        <div className="text-[10px] text-[var(--color-text-dim)]">{detail}</div>
      )}
    </div>
  );
}

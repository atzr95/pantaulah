"use client";

import { useState } from "react";

/** Long body text (MET warnings run to several paragraphs) clamped to 4 lines behind a toggle */
export default function ClampedText({
  text,
  accent,
  className = "",
}: {
  text: string;
  /** Colour of the SHOW MORE control — usually the card's severity colour */
  accent: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // ponytail: char count instead of measuring the rendered box — swap for a ref+scrollHeight check if the cutoff looks wrong
  const isLong = text.length > 260;

  return (
    <div className={className}>
      <p
        className={`text-xs text-[var(--color-text-muted)] leading-relaxed ${
          isLong && !expanded ? "line-clamp-4" : ""
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-1 text-xs tracking-wider cursor-pointer hover:opacity-80"
          style={{ color: accent }}
        >
          {expanded ? "SHOW LESS ▲" : "SHOW MORE ▼"}
        </button>
      )}
    </div>
  );
}

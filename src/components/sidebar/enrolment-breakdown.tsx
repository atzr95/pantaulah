"use client";

import { useMemo, useState } from "react";
import type { EnrolmentBreakdownData } from "@/lib/data/types";

interface EnrolmentBreakdownProps {
  breakdown: EnrolmentBreakdownData | undefined;
}

const LEVEL_CONFIG = [
  { key: "primary" as const, label: "Primary", color: "rgba(0, 212, 255, 0.8)", desc: "Standard 1 to Standard 6 (ages 7-12). Government and government-aided primary schools." },
  { key: "secondary" as const, label: "Secondary", color: "rgba(180, 130, 255, 0.8)", desc: "Form 1 to Form 5 (ages 13-17). Includes lower and upper secondary education." },
];

export default function EnrolmentBreakdown({ breakdown }: EnrolmentBreakdownProps) {
  const [hoveredLevel, setHoveredLevel] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!breakdown) return [];
    const total = breakdown.primary + breakdown.secondary;
    if (total <= 0) return [];
    return LEVEL_CONFIG
      .map((l) => ({
        ...l,
        value: breakdown[l.key],
        pct: (breakdown[l.key] / total) * 100,
      }))
      .filter((b) => b.value > 0);
  }, [breakdown]);

  if (bars.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg)] p-3.5">
      <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2.5">
        ENROLMENT BY LEVEL
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="relative"
            onMouseEnter={() => setHoveredLevel(bar.key)}
            onMouseLeave={() => setHoveredLevel(null)}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] text-[var(--color-text)] tracking-wider cursor-help">{bar.label}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {bar.pct.toFixed(0)}% · {bar.value.toLocaleString("en-MY")}
              </span>
            </div>
            <div
              className="h-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${bar.pct}%`,
                  background: bar.color,
                }}
              />
            </div>
            {hoveredLevel === bar.key && (
              <div
                className="absolute z-50 left-0 right-0 px-2.5 py-1.5 text-[10px] leading-relaxed text-[var(--color-text-muted)] rounded border border-[rgba(0,212,255,0.15)]"
                style={{
                  bottom: "100%",
                  marginBottom: 4,
                  background: "rgba(13, 13, 20, 0.95)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
                }}
              >
                {bar.desc}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

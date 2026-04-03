"use client";

import { useMemo, useState } from "react";
import type { CrimeBreakdownData } from "@/lib/data/types";

interface CrimeBreakdownProps {
  breakdown: CrimeBreakdownData | undefined;
}

const CRIME_CONFIG = [
  { key: "property" as const, label: "Property Crime", color: "rgba(255, 180, 50, 0.8)", desc: "Break-ins, vehicle theft (motorcycle, car, lorry), and other theft." },
  { key: "assault" as const, label: "Violent Crime", color: "rgba(255, 80, 80, 0.8)", desc: "Murder, rape, causing injury, gang robbery (armed/unarmed), and solo robbery (armed/unarmed)." },
];

export default function CrimeBreakdown({ breakdown }: CrimeBreakdownProps) {
  const [hoveredCrime, setHoveredCrime] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!breakdown) return [];
    const total = breakdown.assault + breakdown.property;
    if (total <= 0) return [];
    return CRIME_CONFIG
      .map((c) => ({
        ...c,
        value: breakdown[c.key],
        pct: (breakdown[c.key] / total) * 100,
      }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [breakdown]);

  if (bars.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg)] p-3.5">
      <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2.5">
        CRIME BREAKDOWN
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="relative"
            onMouseEnter={() => setHoveredCrime(bar.key)}
            onMouseLeave={() => setHoveredCrime(null)}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] text-[var(--color-text)] tracking-wider cursor-help">{bar.label}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {bar.pct.toFixed(0)}% · {bar.value.toLocaleString("en-MY")} cases
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
            {hoveredCrime === bar.key && (
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

"use client";

import { useMemo, useState } from "react";
import type { BloodGroupData } from "@/lib/data/types";

interface BloodGroupsProps {
  groups: BloodGroupData | undefined;
}

const GROUP_CONFIG = [
  { key: "o" as const, label: "Type O", color: "rgba(255, 80, 80, 0.8)", desc: "Universal donor for red blood cells. Most common blood type in Malaysia (~38%)." },
  { key: "b" as const, label: "Type B", color: "rgba(0, 180, 255, 0.8)", desc: "Second most common blood type in Malaysia (~28%). Can donate to B and AB." },
  { key: "a" as const, label: "Type A", color: "rgba(100, 200, 120, 0.8)", desc: "Third most common in Malaysia (~25%). Can donate to A and AB." },
  { key: "ab" as const, label: "Type AB", color: "rgba(180, 130, 255, 0.8)", desc: "Rarest blood type (~8%). Universal plasma donor but can only receive from AB for red cells." },
];

export default function BloodGroups({ groups }: BloodGroupsProps) {
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!groups) return [];
    const total = groups.a + groups.b + groups.ab + groups.o;
    if (total <= 0) return [];
    return GROUP_CONFIG
      .map((g) => ({
        ...g,
        value: groups[g.key],
        pct: (groups[g.key] / total) * 100,
      }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [groups]);

  if (bars.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg)] p-3.5">
      <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2.5">
        DONATIONS BY BLOOD GROUP
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="relative"
            onMouseEnter={() => setHoveredGroup(bar.key)}
            onMouseLeave={() => setHoveredGroup(null)}
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
            {hoveredGroup === bar.key && (
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

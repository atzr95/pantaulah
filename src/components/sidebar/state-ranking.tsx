"use client";

import { useMemo } from "react";
import type { CacheData } from "@/lib/data/types";
import type { ChoroplethConfig } from "@/lib/data/choropleth";
import { getMetricValues } from "@/lib/data/choropleth";
import { formatMetricValue, resolveLatestYear } from "@/lib/utils/format";

interface StateRankingProps {
  data: CacheData;
  config: ChoroplethConfig;
  selectedYear: number;
  selectedState: string | null;
  onStateSelect?: (topoName: string | null) => void;
}

/** All 16 states ranked by the active metric — click a row to select that state */
export default function StateRanking({
  data,
  config,
  selectedYear,
  selectedState,
  onStateSelect,
}: StateRankingProps) {
  const ranking = useMemo(() => {
    // Latest year ≤ selected where any state has this metric
    const yearsSeen: Record<number, true> = {};
    for (const stateData of Object.values(data.states)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const yrs = (stateData as any).years;
      if (!yrs) continue;
      for (const key of Object.keys(yrs)) {
        if (yrs[key]?.[config.key] != null) yearsSeen[Number(key)] = true;
      }
    }
    const resolved = resolveLatestYear(yearsSeen, selectedYear);
    if (!resolved) return null;
    const values = getMetricValues(data, config.key, resolved.year);
    const rows = Object.entries(values)
      .filter((entry): entry is [string, number] => entry[1] != null)
      .sort((a, b) => b[1] - a[1]);
    if (rows.length < 2) return null;
    return { year: resolved.year, rows, max: rows[0][1] };
  }, [data, config.key, selectedYear]);

  if (!ranking) return null;

  const barColor = config.colorHue === "amber" ? "rgba(255, 149, 0, 0.35)" : "rgba(0, 212, 255, 0.35)";
  const accent = config.colorHue === "amber" ? "var(--color-amber)" : "var(--color-cyan)";

  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="px-4 py-2.5 flex items-baseline justify-between">
        <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
          STATE RANKING <span className="text-[var(--color-text-dim)]">/ {config.label}</span>
        </div>
        <div className="text-[10px] tracking-[1px] text-[var(--color-text-dim)]">({ranking.year})</div>
      </div>
      <div className="px-4 pb-3 flex flex-col gap-0.5">
        {ranking.rows.map(([topoName, value], i) => {
          const isSelected = topoName === selectedState;
          return (
            <button
              key={topoName}
              type="button"
              onClick={() => onStateSelect?.(isSelected ? null : topoName)}
              aria-label={`Select ${topoName}`}
              className="relative flex items-center gap-2 h-[22px] px-1.5 text-left rounded-sm cursor-pointer hover:bg-[rgba(0,212,255,0.06)]"
              style={isSelected ? { background: "rgba(0, 212, 255, 0.1)" } : undefined}
            >
              <div
                className="absolute inset-y-[3px] left-0 rounded-sm pointer-events-none"
                style={{
                  width: `${Math.max((value / ranking.max) * 100, 1)}%`,
                  background: barColor,
                  opacity: isSelected ? 1 : 0.55,
                }}
              />
              <span className="relative w-6 shrink-0 text-[10px] tabular-nums text-[var(--color-text-dim)]">
                #{i + 1}
              </span>
              <span
                className={`relative flex-1 truncate text-[11px] tracking-[0.5px] ${isSelected ? "font-bold" : ""}`}
                style={{ color: isSelected ? accent : "var(--color-text)" }}
              >
                {topoName.toUpperCase()}
              </span>
              <span className="relative shrink-0 text-[11px] tabular-nums text-[var(--color-text-bright)]">
                {formatMetricValue(config.key, value)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import type { MetricKey } from "@/lib/data/types";
import { CATEGORY_METRICS } from "@/lib/data/choropleth";

interface MetricTogglesProps {
  selectedCategory: string;
  selectedMetric: MetricKey;
  onMetricChange: (metric: MetricKey) => void;
}

export default function MetricToggles({
  selectedCategory,
  selectedMetric,
  onMetricChange,
}: MetricTogglesProps) {
  const configs = CATEGORY_METRICS[selectedCategory] ?? [];

  if (configs.length <= 1) return null; // No toggles needed for single-metric categories

  return (
    <div className="flex flex-wrap justify-end gap-1.5 lg:flex-wrap lg:justify-end overflow-x-auto scrollbar-none">
      {configs.map((config) => (
        <button
          key={config.key}
          onClick={() => onMetricChange(config.key)}
          className={`px-3 py-1 text-[11px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${
            selectedMetric === config.key
              ? "bg-[rgba(0,212,255,0.12)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.1)]"
              : "border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)] bg-[rgba(10,10,15,0.7)] backdrop-blur-sm"
          }`}
        >
          {config.label}
        </button>
      ))}
    </div>
  );
}

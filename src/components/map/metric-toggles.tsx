"use client";

import type { MetricKey } from "@/lib/data/types";
import { CATEGORY_METRICS } from "@/lib/data/choropleth";
import PillButton from "@/components/ui/pill-button";

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
    <div className="flex flex-nowrap gap-1.5 lg:flex-wrap lg:justify-end">
      {configs.map((config) => (
        <PillButton
          key={config.key}
          active={selectedMetric === config.key}
          overlay
          onClick={() => onMetricChange(config.key)}
        >
          {config.label}
        </PillButton>
      ))}
    </div>
  );
}

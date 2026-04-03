"use client";

import { useMemo } from "react";
import type { CacheData } from "@/lib/data/types";

interface RidershipCardProps {
  data: CacheData;
  selectedYear: number;
}

export default function RidershipCard({ data, selectedYear }: RidershipCardProps) {
  const yearData = useMemo(() => data.ridership?.[selectedYear], [data.ridership, selectedYear]);

  if (!yearData || yearData.total === 0) return null;

  const railPct = (yearData.rail / yearData.total) * 100;
  const busPct = (yearData.bus / yearData.total) * 100;

  const formatM = (v: number) => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return v.toLocaleString("en-MY");
  };

  // Find previous year for YoY
  const prevData = data.ridership?.[selectedYear - 1];
  const change = prevData && prevData.total > 0
    ? ((yearData.total - prevData.total) / prevData.total) * 100
    : undefined;

  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="px-4 py-2.5">
        <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
          PUBLIC TRANSIT RIDERSHIP
          <span className="text-[var(--color-text-dim)] ml-2">/ NATIONAL</span>
        </div>
      </div>
      <div className="bg-[var(--color-bg)] p-3.5">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-xl font-bold text-[var(--color-text-bright)]">
            {formatM(yearData.total)}
          </span>
          {change != null && (
            <span
              className="text-[10px]"
              style={{ color: change >= 0 ? "var(--color-green)" : "var(--color-red)" }}
            >
              {change >= 0 ? "+" : ""}{change.toFixed(1)}% YoY
            </span>
          )}
        </div>
        <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] mb-2">
          TOTAL TRIPS IN {selectedYear}
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-[10px] text-[var(--color-text)] tracking-wider">Rail</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {railPct.toFixed(0)}% · {formatM(yearData.rail)}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${railPct}%`, background: "rgba(0, 212, 255, 0.7)" }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className="text-[10px] text-[var(--color-text)] tracking-wider">Bus</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {busPct.toFixed(0)}% · {formatM(yearData.bus)}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${busPct}%`, background: "rgba(100, 200, 120, 0.7)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

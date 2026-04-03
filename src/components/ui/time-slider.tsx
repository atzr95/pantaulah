"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { CacheData, MetricKey } from "@/lib/data/types";

interface TimeSliderProps {
  availableYears: number[];
  selectedYear: number;
  selectedMetric: MetricKey;
  data: CacheData;
  onYearChange: (year: number) => void;
  inline?: boolean;
}

export default function TimeSlider({
  availableYears,
  selectedYear,
  selectedMetric,
  data,
  onYearChange,
  inline = false,
}: TimeSliderProps) {
  const stateEntries = useMemo(() => Object.values(data.states), [data.states]);
  const totalStates = stateEntries.length;

  // Per-year coverage for selected metric
  const yearCoverage = useMemo(() => {
    const coverage: Record<number, number> = {};
    for (const y of availableYears) {
      let count = 0;
      for (const s of stateEntries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((s as any).years?.[y]?.[selectedMetric]) count++;
      }
      coverage[y] = totalStates > 0 ? count / totalStates : 0;
    }
    return coverage;
  }, [availableYears, selectedMetric, stateEntries, totalStates]);

  // Only years with data
  const dataYears = useMemo(
    () => availableYears.filter((y) => yearCoverage[y] > 0),
    [availableYears, yearCoverage]
  );

  // Slider operates on index (0..N-1) so it always snaps to data years
  const currentIdx = Math.max(0, dataYears.indexOf(selectedYear));
  const maxIdx = dataYears.length - 1;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value);
      if (dataYears[idx] != null) onYearChange(dataYears[idx]);
    },
    [onYearChange, dataYears]
  );

  const statesWithData = useMemo(() => {
    let count = 0;
    for (const s of stateEntries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((s as any).years?.[selectedYear]?.[selectedMetric]) count++;
    }
    return count;
  }, [stateEntries, selectedYear, selectedMetric]);

  const coverageRatio = yearCoverage[selectedYear] ?? 0;

  if (dataYears.length === 0) {
    return (
      <div className={inline ? "" : "absolute bottom-4 lg:bottom-16 left-3 right-3 lg:left-5 lg:right-[396px]"}>
        <div className="text-[10px] tracking-wider text-[var(--color-red)]">
          NO DATA AVAILABLE FOR THIS METRIC
        </div>
      </div>
    );
  }

  // Measure label row width to compute step dynamically
  const labelRowRef = useRef<HTMLDivElement>(null);
  const [labelStep, setLabelStep] = useState(1);

  useEffect(() => {
    if (!labelRowRef.current || dataYears.length <= 1) { setLabelStep(1); return; }
    const observe = () => {
      const width = labelRowRef.current?.offsetWidth ?? 0;
      // ~36px per 4-digit year label at 10px font + tracking
      const fits = Math.max(1, Math.floor(width / 36));
      const step = Math.ceil(dataYears.length / fits);
      setLabelStep(step);
    };
    observe();
    const ro = new ResizeObserver(observe);
    ro.observe(labelRowRef.current);
    return () => ro.disconnect();
  }, [dataYears.length]);

  const pct = maxIdx > 0 ? (currentIdx / maxIdx) * 100 : 50;

  return (
    <div className={
      inline
        ? "flex flex-col gap-1 bg-[rgba(10,10,15,0.85)] backdrop-blur-sm rounded px-2 py-1.5"
        : "absolute bottom-2 lg:bottom-10 left-3 right-3 lg:left-5 lg:right-[396px] flex flex-col gap-1 bg-[rgba(10,10,15,0.85)] lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none rounded lg:rounded-none px-2 py-1.5 lg:p-0"
    }>
      {/* Mobile: selected year display */}
      <div className="flex lg:hidden items-center justify-between mb-0.5">
        <span className="text-[10px] tracking-wider text-[var(--color-text-dim)]">YEAR</span>
        <span
          className="text-xs font-bold tracking-[2px] text-[var(--color-cyan)]"
          style={{ textShadow: "0 0 8px rgba(0, 212, 255, 0.3)" }}
        >
          {selectedYear}
        </span>
      </div>

      {/* Slider row */}
      <div className="flex items-center gap-2 lg:gap-3">
        <span className="text-[10px] tracking-wider text-[var(--color-text-dim)] shrink-0 w-[22px] text-right hidden lg:inline">
          {dataYears[0]}
        </span>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={maxIdx}
            step={1}
            value={currentIdx}
            onChange={handleChange}
            className="w-full h-1 appearance-none bg-transparent cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgba(0,212,255,0.4) ${pct}%, rgba(0,212,255,0.1) ${pct}%)`,
              borderRadius: 2,
            }}
            aria-label={`Timeline: ${selectedYear}`}
          />
          <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: #00d4ff;
              box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
              cursor: pointer;
              border: 2px solid #0a0a0f;
            }
            input[type="range"]::-moz-range-thumb {
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: #00d4ff;
              box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
              cursor: pointer;
              border: 2px solid #0a0a0f;
            }
          `}</style>
        </div>
        <span className="text-[10px] tracking-wider text-[var(--color-text-dim)] shrink-0 hidden lg:inline">
          {dataYears[dataYears.length - 1]}
        </span>
      </div>

      {/* Year labels row — below slider (desktop only, too dense for mobile) */}
      <div ref={labelRowRef} className="relative h-4 hidden lg:block" style={{ marginLeft: 30, marginRight: 94 }}>
        {dataYears.map((y, i) => {
          const isSelected = y === selectedYear;
          const leftPct = maxIdx > 0 ? (i / maxIdx) * 100 : 50;
          const prevYear = i > 0 ? dataYears[i - 1] : y;
          const hasGap = y - prevYear > 1;
          const gapPct = i > 0 && maxIdx > 0 ? ((i - 0.5) / maxIdx) * 100 : 0;

          const isFirst = i === 0;
          const isLast = i === maxIdx;
          const showLabel = isFirst || isLast || isSelected || i % labelStep === 0;

          return (
            <span key={y}>
              {hasGap && (
                <span
                  className="absolute text-[7px] text-[var(--color-text-dim)] opacity-30 -translate-x-1/2 top-[2px] select-none"
                  style={{ left: `${gapPct}%` }}
                >
                  ···
                </span>
              )}
              {showLabel && (
                <button
                  onClick={() => onYearChange(y)}
                  className="absolute -translate-x-1/2 text-[10px] tracking-wider transition-all cursor-pointer"
                  style={{
                    left: `${leftPct}%`,
                    top: 0,
                    color: isSelected ? "#00d4ff" : "var(--color-text-dim)",
                    fontWeight: isSelected ? 700 : 400,
                    textShadow: isSelected ? "0 0 8px rgba(0, 212, 255, 0.3)" : "none",
                  }}
                >
                  {y}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Coverage badge */}
      <div className="hidden lg:flex items-center gap-2" style={{ marginLeft: 30 }}>
        <span
          className="text-[10px] tracking-wider"
          style={{
            color: coverageRatio >= 0.8
              ? "var(--color-green)"
              : coverageRatio > 0
                ? "var(--color-amber)"
                : "var(--color-red)",
          }}
        >
          {statesWithData}/{totalStates} STATES
        </span>
        {coverageRatio > 0 && coverageRatio < 0.5 && (
          <span className="text-[10px] tracking-wider text-[var(--color-amber)]">
            PARTIAL COVERAGE
          </span>
        )}
      </div>
    </div>
  );
}

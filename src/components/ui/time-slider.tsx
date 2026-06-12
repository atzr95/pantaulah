"use client";

import { useMemo, useCallback, useRef, useState, useEffect, useTransition } from "react";
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
  const externalIdx = Math.max(0, dataYears.indexOf(selectedYear));
  const maxIdx = dataYears.length - 1;

  // Local urgent value for instant thumb/label feedback; heavy downstream
  // updates (map re-render) go through a transition.
  const [localIdx, setLocalIdx] = useState(externalIdx);
  const [prevExternalIdx, setPrevExternalIdx] = useState(externalIdx);
  const [isPending, startTransition] = useTransition();

  if (externalIdx !== prevExternalIdx) {
    setPrevExternalIdx(externalIdx);
    if (!isPending) setLocalIdx(externalIdx);
  }

  const currentIdx = Math.min(Math.max(0, localIdx), Math.max(0, maxIdx));
  const displayYear = dataYears[currentIdx] ?? selectedYear;

  const selectYear = useCallback(
    (idx: number) => {
      const year = dataYears[idx];
      if (year == null) return;
      setLocalIdx(idx);
      startTransition(() => onYearChange(year));
    },
    [onYearChange, dataYears]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      selectYear(parseInt(e.target.value));
    },
    [selectYear]
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

  if (dataYears.length === 0) {
    return (
      <div className={inline ? "" : "absolute bottom-4 lg:bottom-16 left-3 right-3 lg:left-5 lg:right-[396px]"}>
        <div className="text-[10px] tracking-wider text-[var(--color-red)]">
          NO DATA AVAILABLE FOR THIS METRIC
        </div>
      </div>
    );
  }

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
          {displayYear}
        </span>
      </div>

      {/* Slider row */}
      <div className="flex items-center gap-2 lg:gap-3">
        <span className="text-[10px] tracking-wider text-[var(--color-text-dim)] shrink-0 w-[22px] text-right hidden lg:inline">
          {dataYears[0]}
        </span>
        <div className="relative flex-1 h-6 flex items-center">
          {/* Visual track — input itself is taller for an easier grab */}
          <div
            className="absolute inset-x-0 h-1 pointer-events-none"
            style={{
              background: `linear-gradient(to right, rgba(0,212,255,0.4) ${pct}%, rgba(0,212,255,0.1) ${pct}%)`,
              borderRadius: 2,
            }}
          />
          <input
            type="range"
            min={0}
            max={maxIdx}
            step={1}
            value={currentIdx}
            onChange={handleChange}
            className="relative w-full h-6 appearance-none bg-transparent cursor-pointer"
            aria-label={`Timeline: ${displayYear}`}
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

      {/* Year labels row — below slider (desktop only, too dense for mobile).
          Invisible copies of the end-year labels keep this row aligned with the
          track above, whatever the font metrics. */}
      <div className="hidden lg:flex items-center gap-3">
        <span className="text-[10px] tracking-wider shrink-0 w-[22px] invisible" aria-hidden="true">
          {dataYears[0]}
        </span>
        <div ref={labelRowRef} className="relative h-4 flex-1">
          {dataYears.map((y, i) => {
            const isSelected = y === displayYear;
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
                    className="absolute text-[9px] text-[var(--color-text-dim)] opacity-40 -translate-x-1/2 top-[2px] select-none"
                    style={{ left: `${gapPct}%` }}
                  >
                    ···
                  </span>
                )}
                {showLabel && (
                  <button
                    onClick={() => selectYear(i)}
                    className="absolute -translate-x-1/2 text-[10px] tracking-wider transition-all cursor-pointer px-1.5 py-1 -top-1"
                    style={{
                      left: `${leftPct}%`,
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
        <span className="text-[10px] tracking-wider shrink-0 invisible" aria-hidden="true">
          {dataYears[dataYears.length - 1]}
        </span>
      </div>

      {/* Coverage badge */}
      <div className="hidden lg:flex items-center gap-3">
        <span className="text-[10px] tracking-wider shrink-0 w-[22px] invisible" aria-hidden="true">
          {dataYears[0]}
        </span>
        <div className="flex items-center gap-2">
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
    </div>
  );
}

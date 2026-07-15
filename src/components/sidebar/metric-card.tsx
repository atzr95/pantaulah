"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import type { SparklinePoint } from "@/lib/data/types";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  isAlert?: boolean;
  sparklineData?: SparklinePoint[];
  sparklineColor?: string;
  description?: string;
  /** Vintage tag (e.g. "(2022)") shown when the displayed value is from an older year */
  vintage?: string;
  /** Rank among states (e.g. "#3/16"), shown top-right when a state is selected */
  rank?: string;
}

function Sparkline({ data, color }: { data: SparklinePoint[]; color: string }) {
  const gradientId = useId();
  const w = 100;
  const h = 24;
  const pad = 2;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = data.map((d, i) => [
    (i / (data.length - 1)) * w,
    h - pad - ((d.value - min) / range) * (h - pad * 2),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `M${pts[0][0].toFixed(2)},${h} L${line.split(" ").join(" L")} L${pts[pts.length - 1][0].toFixed(2)},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricTooltip({ description, anchorRef }: { description: string; anchorRef: React.RefObject<HTMLElement | null> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipW = 200;
    let left = rect.right - tooltipW;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 6, left });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text)] rounded border border-[rgba(0,212,255,0.25)] whitespace-normal w-[200px] font-mono"
      style={{
        top: pos.top,
        left: pos.left,
        background: "rgba(13, 13, 20, 0.95)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
      }}
    >
      {description}
    </div>,
    document.body
  );
}

export default function MetricCard({
  label,
  value,
  change,
  isAlert = false,
  sparklineData,
  sparklineColor = "rgba(0, 212, 255, 0.4)",
  description,
  vintage,
  rank,
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const changeIsNegative = change?.startsWith("-") || change?.includes("down");
  const changeColor = isAlert
    ? "var(--color-red)"
    : changeIsNegative
      ? "var(--color-red)"
      : "var(--color-green)";

  return (
    <div className="bg-[var(--color-bg)] p-3.5 relative">
      <div
        className="text-[12px] font-medium tracking-[1.5px] text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1.5"
      >
        {label}
        {description && (
          <button
            type="button"
            ref={iconRef}
            aria-label={`About ${label}`}
            aria-expanded={showTooltip}
            className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[var(--color-border-bright)] text-[10px] text-[var(--color-text-dim)] cursor-help shrink-0 leading-none before:absolute before:-inset-2 before:content-['']"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            onClick={() => setShowTooltip(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowTooltip(false);
            }}
          >
            ?
            {showTooltip && <MetricTooltip description={description} anchorRef={iconRef} />}
          </button>
        )}
        {rank && (
          <span className="ml-auto text-[10px] font-normal tracking-[1px] text-[var(--color-cyan)] shrink-0">
            {rank}
          </span>
        )}
      </div>
      <div
        className={`text-xl font-bold ${isAlert ? "text-[var(--color-amber)]" : "text-[var(--color-text-bright)]"}`}
      >
        {value}
        {vintage && (
          <span className="ml-1.5 text-[10px] font-normal tracking-[1px] text-[var(--color-text-dim)] align-middle">
            {vintage}
          </span>
        )}
      </div>
      {change && (
        <div className="text-[10px] mt-0.5" style={{ color: changeColor }}>
          <span aria-hidden="true">{changeIsNegative ? "▼" : "▲"}</span> {change}
        </div>
      )}
      {sparklineData && sparklineData.length >= 3 && (
        <div className="mt-2 h-6">
          <Sparkline data={sparklineData} color={sparklineColor} />
        </div>
      )}
    </div>
  );
}

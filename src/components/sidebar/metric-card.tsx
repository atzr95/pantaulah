"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { SparklinePoint } from "@/lib/data/types";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  isAlert?: boolean;
  sparklineData?: SparklinePoint[];
  sparklineColor?: string;
  description?: string;
}

function MetricTooltip({ description, anchorRef }: { description: string; anchorRef: React.RefObject<HTMLSpanElement | null> }) {
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
}: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
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
          <span
            ref={iconRef}
            className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[rgba(0,212,255,0.3)] text-[10px] text-[var(--color-text-dim)] cursor-help shrink-0 leading-none"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            ?
            {showTooltip && <MetricTooltip description={description} anchorRef={iconRef} />}
          </span>
        )}
      </div>
      <div
        className={`text-xl font-bold ${isAlert ? "text-[var(--color-amber)]" : "text-[var(--color-text-bright)]"}`}
      >
        {value}
      </div>
      {change && (
        <div className="text-[10px] mt-0.5" style={{ color: changeColor }}>
          {change}
        </div>
      )}
      {sparklineData && sparklineData.length >= 3 && (
        <div className="mt-2 h-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={sparklineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparklineColor}
                strokeWidth={1.5}
                fill={`url(#grad-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

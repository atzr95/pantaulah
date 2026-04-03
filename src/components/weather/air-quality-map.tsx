"use client";

import { useMemo, useState, useCallback } from "react";
import { type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import type { AirQualityData, AirQualityReading, AirQualityStatus } from "@/lib/data/weather-types";
import { getAirQualityStatus, getAirQualityColor } from "@/lib/data/weather-types";
import ResponsiveMapLayout, { useMapProjections } from "@/components/map/responsive-map-layout";

interface StateProperties {
  Name: string;
}

const HIDDEN_LABELS = new Set(["Kuala Lumpur", "Putrajaya", "Melaka"]);
const LABEL_OFFSETS: Record<string, [number, number]> = {
  "Perlis": [0, -12],
  "Penang": [-14, 0],
  "Negeri Sembilan": [0, -10],
};

function getApiFill(api: number | undefined): string {
  if (api == null) return "rgba(30, 40, 55, 0.6)";
  const status = getAirQualityStatus(api);
  switch (status) {
    case "GOOD": return "rgba(34, 197, 94, 0.35)";
    case "MODERATE": return "rgba(0, 212, 255, 0.35)";
    case "UNHEALTHY": return "rgba(255, 149, 0, 0.4)";
    case "VERY_UNHEALTHY": return "rgba(239, 68, 68, 0.45)";
    case "HAZARDOUS": return "rgba(139, 92, 246, 0.5)";
  }
}

function getApiStroke(api: number | undefined): string {
  if (api == null) return "rgba(100, 140, 170, 0.3)";
  const status = getAirQualityStatus(api);
  switch (status) {
    case "GOOD": return "rgba(34, 197, 94, 0.5)";
    case "MODERATE": return "rgba(0, 212, 255, 0.5)";
    case "UNHEALTHY": return "rgba(255, 149, 0, 0.6)";
    case "VERY_UNHEALTHY": return "rgba(239, 68, 68, 0.7)";
    case "HAZARDOUS": return "rgba(139, 92, 246, 0.7)";
  }
}

function getStatusLabel(status: AirQualityStatus): string {
  switch (status) {
    case "GOOD": return "GOOD";
    case "MODERATE": return "MODERATE";
    case "UNHEALTHY": return "UNHEALTHY";
    case "VERY_UNHEALTHY": return "V.UNHEALTHY";
    case "HAZARDOUS": return "HAZARDOUS";
  }
}

interface AirQualityMapProps {
  airQuality: AirQualityData;
  selectedState: string | null;
  onStateSelect: (state: string | null) => void;
  sheetSnap?: "peek" | "half" | "full";
}

export default function AirQualityMap({
  airQuality,
  selectedState,
  onStateSelect,
  sheetSnap,
}: AirQualityMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const projections = useMapProjections();

  const stateReadingMap = useMemo(() => {
    const map: Record<string, AirQualityReading> = {};
    for (const r of airQuality.readings) map[r.state] = r;
    return map;
  }, [airQuality]);

  const handleMouseMove = useCallback((e: React.MouseEvent, name: string) => {
    setHoveredState(name);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const renderSVGContent = useCallback(
    (features: Feature<Geometry, StateProperties>[], pathGen: ReturnType<typeof import("d3-geo").geoPath>) => (
      <>
        {features.map((feat) => {
          const name = feat.properties.Name;
          const reading = stateReadingMap[name];
          const apiValue = reading?.apiValue;
          const isSelected = selectedState === name;
          const isHovered = hoveredState === name;

          return (
            <path
              key={name}
              d={pathGen(feat as GeoPermissibleObjects) || ""}
              fill={isSelected ? "rgba(0, 212, 255, 0.35)" : isHovered ? "rgba(0, 212, 255, 0.3)" : getApiFill(apiValue)}
              stroke={isSelected ? "#00d4ff" : isHovered ? "rgba(0, 212, 255, 0.8)" : getApiStroke(apiValue)}
              strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
              className="transition-all duration-300 cursor-pointer outline-none"
              style={{ outline: "none", ...(isSelected ? { filter: "drop-shadow(0 0 8px rgba(0, 212, 255, 0.3))" } : {}) }}
              onClick={() => onStateSelect(isSelected ? null : name)}
              onMouseMove={(e) => handleMouseMove(e, name)}
              onMouseLeave={() => setHoveredState(null)}
              role="button"
              aria-label={`${name}: API ${apiValue ?? "N/A"}`}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onStateSelect(isSelected ? null : name); }}
            />
          );
        })}

        {features.map((feat) => {
          const name = feat.properties.Name;
          if (HIDDEN_LABELS.has(name)) return null;
          const reading = stateReadingMap[name];
          if (!reading) return null;
          const centroid = pathGen.centroid(feat as GeoPermissibleObjects);
          if (!centroid || isNaN(centroid[0])) return null;
          const [dx, dy] = LABEL_OFFSETS[name] ?? [0, 0];
          const color = getAirQualityColor(reading.status);

          return (
            <g key={`label-${name}`} style={{ pointerEvents: "none" }}>
              <text x={centroid[0] + dx} y={centroid[1] + dy - 2} textAnchor="middle" fontSize={12} fontWeight="bold" fill={color} style={{ textShadow: "0 0 6px rgba(0,0,0,0.9)" }}>
                {reading.apiValue}
              </text>
              <text x={centroid[0] + dx} y={centroid[1] + dy + 10} textAnchor="middle" fontSize={7} fontWeight="bold" fill={color} opacity={0.7} style={{ textShadow: "0 0 4px rgba(0,0,0,0.9)" }}>
                {reading.dominantPollutant}
              </text>
            </g>
          );
        })}
      </>
    ),
    [stateReadingMap, selectedState, hoveredState, handleMouseMove, onStateSelect]
  );

  const overlay = (
    <>
      {hoveredState && (() => {
        const reading = stateReadingMap[hoveredState];
        return (
          <div className="fixed z-50 pointer-events-none px-3 py-2.5 text-xs" style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10, background: "rgba(13, 13, 20, 0.95)", border: `1px solid ${reading ? getAirQualityColor(reading.status) + "60" : "rgba(0,212,255,0.3)"}`, borderRadius: 4, color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em", minWidth: 200 }}>
            <div className="font-bold text-[var(--color-cyan)] tracking-wider mb-1.5">{hoveredState.toUpperCase()}</div>
            {reading ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-dim)]">Air Pollutant Index</span>
                  <span className="font-bold text-sm" style={{ color: getAirQualityColor(reading.status) }}>{reading.apiValue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-dim)]">Status</span>
                  <span className="font-bold" style={{ color: getAirQualityColor(reading.status) }}>{getStatusLabel(reading.status)}</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]"><span>Dominant</span><span>{reading.dominantPollutant}</span></div>
                <div className="border-t border-[rgba(255,255,255,0.06)] my-1 pt-1" />
                <div className="flex justify-between text-[var(--color-text-dim)]"><span>PM2.5</span><span>{reading.pm25} µg/m³</span></div>
                <div className="flex justify-between text-[var(--color-text-dim)]"><span>PM10</span><span>{reading.pm10} µg/m³</span></div>
                <div className="flex justify-between text-[var(--color-text-dim)]"><span>O₃</span><span>{reading.o3} ppb</span></div>
                <div className="flex justify-between text-[var(--color-text-dim)]"><span>Station</span><span className="text-right">{reading.stationName}</span></div>
              </div>
            ) : (
              <div className="text-[var(--color-text-dim)]">No data</div>
            )}
          </div>
        );
      })()}

      <div className="absolute bottom-5 left-5 text-[10px] text-[var(--color-text-muted)] space-y-1.5 hidden lg:block">
        <div className="tracking-[2px] mb-2" style={{ color: "rgba(0, 212, 255, 0.75)" }}>AIR POLLUTANT INDEX</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(34, 197, 94, 0.35)" }} /><span style={{ color: "var(--color-green)" }}>0–50 GOOD</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(0, 212, 255, 0.35)" }} /><span style={{ color: "var(--color-cyan)" }}>51–100 MODERATE</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(255, 149, 0, 0.4)" }} /><span style={{ color: "var(--color-amber)" }}>101–200 UNHEALTHY</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(239, 68, 68, 0.45)" }} /><span style={{ color: "var(--color-red)" }}>201–300 V.UNHEALTHY</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(139, 92, 246, 0.5)" }} /><span style={{ color: "#8b5cf6" }}>300+ HAZARDOUS</span></div>
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)]"><span className="text-[10px]">SOURCE: OPEN-METEO AIR QUALITY</span></div>
      </div>

      <div className="absolute top-4 left-4 text-xs tracking-wider hidden lg:block" style={{ color: "var(--color-text-muted)" }}>
        3.1390&deg;N 101.6869&deg;E
      </div>
    </>
  );

  return (
    <ResponsiveMapLayout
      projections={projections}
      renderSVGContent={renderSVGContent}
      overlay={overlay}
      onBackgroundClick={() => onStateSelect(null)}
      onMouseLeave={() => setHoveredState(null)}
      sheetSnap={sheetSnap}
    />
  );
}

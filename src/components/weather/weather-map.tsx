"use client";

import { useMemo, useState, useCallback } from "react";
import { type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import type { ForecastEntry } from "@/lib/data/weather-types";
import ResponsiveMapLayout, { useMapProjections } from "@/components/map/responsive-map-layout";

interface StateProperties {
  Name: string;
}

const FORECAST_TO_TOPO: Record<string, string> = {
  "Penang": "Penang",
  "Kuala Lumpur": "Kuala Lumpur",
  "Putrajaya": "Putrajaya",
  "Labuan": "Labuan",
};

function getTopoName(forecastState: string): string {
  return FORECAST_TO_TOPO[forecastState] ?? forecastState;
}

function getTempFill(maxTemp: number | undefined): string {
  if (maxTemp == null) return "rgba(30, 40, 55, 0.6)";
  if (maxTemp >= 35) return "rgba(239, 68, 68, 0.45)";
  if (maxTemp >= 34) return "rgba(255, 149, 0, 0.4)";
  if (maxTemp >= 33) return "rgba(255, 180, 50, 0.3)";
  if (maxTemp >= 32) return "rgba(0, 212, 255, 0.35)";
  return "rgba(0, 180, 230, 0.25)";
}

function getTempStroke(maxTemp: number | undefined): string {
  if (maxTemp == null) return "rgba(100, 140, 170, 0.3)";
  if (maxTemp >= 35) return "rgba(239, 68, 68, 0.6)";
  if (maxTemp >= 34) return "rgba(255, 149, 0, 0.6)";
  if (maxTemp >= 33) return "rgba(255, 180, 50, 0.5)";
  return "rgba(0, 212, 255, 0.5)";
}

function getWeatherIcon(forecast: string): string {
  const f = forecast.toLowerCase();
  if (f.includes("thunder")) return "\u{1F329}\uFE0F";
  if (f.includes("heavy rain")) return "\u{1F327}\uFE0F";
  if (f.includes("rain")) return "\u{1F326}\uFE0F";
  if (f.includes("cloudy") || f.includes("overcast")) return "\u2601\uFE0F";
  if (f.includes("haz")) return "\u{1F32B}\uFE0F";
  if (f.includes("fair") || f.includes("no rain")) return "\u2600\uFE0F";
  return "\u{1F324}\uFE0F";
}

const HIDDEN_LABELS = new Set(["Kuala Lumpur", "Putrajaya"]);
const LABEL_OFFSETS: Record<string, [number, number]> = {
  "Perlis": [0, -12],
  "Penang": [-14, 0],
  "Negeri Sembilan": [0, -10],
  "Melaka": [0, 8],
};

interface WeatherMapProps {
  forecasts: ForecastEntry[];
  selectedDate: string;
  selectedState: string | null;
  onStateSelect: (state: string | null) => void;
  sheetSnap?: "peek" | "half" | "full";
}

export default function WeatherMap({
  forecasts,
  selectedDate,
  selectedState,
  onStateSelect,
  sheetSnap,
}: WeatherMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const projections = useMapProjections();

  const stateForecastMap = useMemo(() => {
    const map: Record<string, ForecastEntry> = {};
    for (const f of forecasts) {
      if (f.date === selectedDate) {
        map[getTopoName(f.location.state)] = f;
      }
    }
    return map;
  }, [forecasts, selectedDate]);

  const handleMouseMove = useCallback((e: React.MouseEvent, name: string) => {
    setHoveredState(name);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const renderSVGContent = useCallback(
    (features: Feature<Geometry, StateProperties>[], pathGen: ReturnType<typeof import("d3-geo").geoPath>) => (
      <>
        {features.map((feat) => {
          const name = feat.properties.Name;
          const forecast = stateForecastMap[name];
          const maxTemp = forecast?.maxTemp;
          const isSelected = selectedState === name;
          const isHovered = hoveredState === name;

          return (
            <path
              key={name}
              d={pathGen(feat as GeoPermissibleObjects) || ""}
              fill={isSelected ? "rgba(0, 212, 255, 0.35)" : isHovered ? "rgba(0, 212, 255, 0.3)" : getTempFill(maxTemp)}
              stroke={isSelected ? "#00d4ff" : isHovered ? "rgba(0, 212, 255, 0.8)" : getTempStroke(maxTemp)}
              strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
              className="transition-all duration-300 cursor-pointer outline-none"
              style={{ outline: "none", ...(isSelected ? { filter: "drop-shadow(0 0 8px rgba(0, 212, 255, 0.3))" } : {}) }}
              onClick={() => onStateSelect(isSelected ? null : name)}
              onMouseMove={(e) => handleMouseMove(e, name)}
              onMouseLeave={() => setHoveredState(null)}
              role="button"
              aria-label={`${name}: ${maxTemp != null ? `${maxTemp}°C` : "No data"}`}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onStateSelect(isSelected ? null : name); }}
            />
          );
        })}

        {features.map((feat) => {
          const name = feat.properties.Name;
          if (HIDDEN_LABELS.has(name)) return null;
          const forecast = stateForecastMap[name];
          if (!forecast) return null;
          const centroid = pathGen.centroid(feat as GeoPermissibleObjects);
          if (!centroid || isNaN(centroid[0])) return null;
          const [dx, dy] = LABEL_OFFSETS[name] ?? [0, 0];

          return (
            <g key={`label-${name}`} style={{ pointerEvents: "none" }}>
              <text x={centroid[0] + dx} y={centroid[1] + dy - 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="var(--color-text-bright)" style={{ textShadow: "0 0 4px rgba(0,0,0,0.8)" }}>
                {forecast.maxTemp}°
              </text>
              <text x={centroid[0] + dx} y={centroid[1] + dy + 8} textAnchor="middle" fontSize={9} fill="var(--color-text-dim)" style={{ textShadow: "0 0 4px rgba(0,0,0,0.8)" }}>
                {getWeatherIcon(forecast.summaryForecast)}
              </text>
            </g>
          );
        })}
      </>
    ),
    [stateForecastMap, selectedState, hoveredState, handleMouseMove, onStateSelect]
  );

  const overlay = (
    <>
      {hoveredState && (() => {
        const forecast = stateForecastMap[hoveredState];
        return (
          <div className="fixed z-50 pointer-events-none px-3 py-2 text-xs" style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 10, background: "rgba(13, 13, 20, 0.95)", border: "1px solid rgba(0, 212, 255, 0.3)", borderRadius: 4, color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
            <div className="font-bold text-[var(--color-cyan)] tracking-wider">{hoveredState.toUpperCase()}</div>
            {forecast ? (
              <div className="mt-1 space-y-0.5">
                <div className="text-[var(--color-text-bright)]">{forecast.maxTemp}° / {forecast.minTemp}°C</div>
                <div className="text-[var(--color-text-dim)]">{forecast.summaryForecast}</div>
              </div>
            ) : (
              <div className="text-[var(--color-text-dim)] mt-0.5">No forecast data</div>
            )}
          </div>
        );
      })()}

      <div className="absolute bottom-5 left-5 text-[10px] text-[var(--color-text-muted)] space-y-1.5 hidden lg:block">
        <div className="tracking-[2px] mb-2" style={{ color: "rgba(0, 212, 255, 0.75)" }}>MAX TEMPERATURE</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(239, 68, 68, 0.45)" }} />&ge; 35°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(255, 149, 0, 0.4)" }} />34°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(255, 180, 50, 0.3)" }} />33°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(0, 212, 255, 0.35)" }} />32°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(0, 180, 230, 0.25)" }} />&le; 31°C</div>
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

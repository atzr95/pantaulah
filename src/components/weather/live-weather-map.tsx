"use client";

import { useState, useCallback, useEffect } from "react";
import { type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import type { CurrentWeather } from "@/lib/data/weather-types";
import ResponsiveMapLayout, { useMapProjections } from "@/components/map/responsive-map-layout";

interface StateProperties {
  Name: string;
}

interface AllStatesData {
  states: Record<string, { locationName: string; current: CurrentWeather }>;
  fetchedAt: string;
}

function getWmoIcon(code: number): string {
  if (code === 0) return "\u2600\uFE0F";
  if (code <= 3) return "\u26C5";
  if (code <= 49) return "\u{1F32B}\uFE0F";
  if (code <= 59) return "\u{1F326}\uFE0F";
  if (code <= 69) return "\u{1F327}\uFE0F";
  if (code <= 79) return "\u2744\uFE0F";
  if (code <= 84) return "\u{1F326}\uFE0F";
  return "\u{1F329}\uFE0F";
}

function getWmoLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  return "Thunderstorm";
}

function getWindDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function getLiveTempFill(temp: number | undefined): string {
  if (temp == null) return "rgba(30, 40, 55, 0.6)";
  if (temp >= 35) return "rgba(239, 68, 68, 0.5)";
  if (temp >= 33) return "rgba(255, 149, 0, 0.45)";
  if (temp >= 31) return "rgba(255, 200, 50, 0.35)";
  if (temp >= 28) return "rgba(0, 212, 255, 0.35)";
  if (temp >= 25) return "rgba(0, 180, 230, 0.25)";
  return "rgba(100, 200, 255, 0.2)";
}

function getLiveTempStroke(temp: number | undefined): string {
  if (temp == null) return "rgba(100, 140, 170, 0.3)";
  if (temp >= 35) return "rgba(239, 68, 68, 0.7)";
  if (temp >= 33) return "rgba(255, 149, 0, 0.6)";
  if (temp >= 31) return "rgba(255, 200, 50, 0.5)";
  if (temp >= 28) return "rgba(0, 212, 255, 0.5)";
  return "rgba(0, 180, 230, 0.4)";
}

function getTempColor(temp: number): string {
  if (temp >= 35) return "var(--color-red)";
  if (temp >= 32) return "var(--color-amber)";
  return "var(--color-cyan)";
}

const HIDDEN_LABELS = new Set(["Kuala Lumpur", "Putrajaya"]);
const LABEL_OFFSETS: Record<string, [number, number]> = {
  "Perlis": [0, -12],
  "Penang": [-14, 0],
  "Negeri Sembilan": [0, -10],
  "Melaka": [0, 8],
};

interface LiveWeatherMapProps {
  selectedState: string | null;
  onStateSelect: (state: string | null) => void;
  sheetSnap?: "peek" | "half" | "full";
}

export default function LiveWeatherMap({
  selectedState,
  onStateSelect,
  sheetSnap,
}: LiveWeatherMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [data, setData] = useState<AllStatesData | null>(null);
  const projections = useMapProjections();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch("/api/weather/current/all");
        if (res.ok) setData(await res.json());
      } catch {
        // keep previous
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent, name: string) => {
    setHoveredState(name);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const renderSVGContent = useCallback(
    (features: Feature<Geometry, StateProperties>[], pathGen: ReturnType<typeof import("d3-geo").geoPath>, _proj: ReturnType<typeof import("d3-geo").geoMercator>) => (
      <>
        {features.map((feat) => {
          const name = feat.properties.Name;
          const stateData = data?.states[name];
          const temp = stateData?.current.temperature;
          const isSelected = selectedState === name;
          const isHovered = hoveredState === name;

          return (
            <path
              key={name}
              d={pathGen(feat as GeoPermissibleObjects) || ""}
              fill={
                isSelected
                  ? "rgba(0, 212, 255, 0.35)"
                  : isHovered
                    ? "rgba(0, 212, 255, 0.3)"
                    : getLiveTempFill(temp)
              }
              stroke={
                isSelected
                  ? "#00d4ff"
                  : isHovered
                    ? "rgba(0, 212, 255, 0.8)"
                    : getLiveTempStroke(temp)
              }
              strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
              className="transition-all duration-300 cursor-pointer outline-none"
              style={{
                outline: "none",
                ...(isSelected ? { filter: "drop-shadow(0 0 8px rgba(0, 212, 255, 0.3))" } : {}),
              }}
              onClick={() => onStateSelect(isSelected ? null : name)}
              onMouseMove={(e) => handleMouseMove(e, name)}
              onMouseLeave={() => setHoveredState(null)}
              role="button"
              aria-label={`${name}: ${temp != null ? `${temp.toFixed(1)}°C` : "Loading"}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onStateSelect(isSelected ? null : name);
              }}
            />
          );
        })}

        {/* Temperature labels */}
        {data &&
          features.map((feat) => {
            const name = feat.properties.Name;
            if (HIDDEN_LABELS.has(name)) return null;
            const stateData = data.states[name];
            if (!stateData) return null;

            const centroid = pathGen.centroid(feat as GeoPermissibleObjects);
            if (!centroid || isNaN(centroid[0])) return null;

            const c = stateData.current;
            const [dx, dy] = LABEL_OFFSETS[name] ?? [0, 0];
            const lx = centroid[0] + dx;
            const ly = centroid[1] + dy;

            return (
              <g key={`label-${name}`} style={{ pointerEvents: "none" }}>
                <text
                  x={lx} y={ly - 4} textAnchor="middle"
                  fontSize={11} fontWeight="bold"
                  fill="var(--color-text-bright)"
                  style={{ textShadow: "0 0 6px rgba(0,0,0,0.9)" }}
                >
                  {c.temperature.toFixed(1)}°
                </text>
                <text
                  x={lx} y={ly + 10} textAnchor="middle"
                  fontSize={10} fill="var(--color-text-dim)"
                  style={{ textShadow: "0 0 4px rgba(0,0,0,0.8)" }}
                >
                  {getWmoIcon(c.weatherCode)}
                </text>
              </g>
            );
          })}
      </>
    ),
    [data, selectedState, hoveredState, handleMouseMove, onStateSelect]
  );

  const overlay = (
    <>
      {/* Loading overlay */}
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-[var(--color-text-dim)] text-xs tracking-wider">
            FETCHING LIVE DATA FROM OPEN-METEO...
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoveredState && (() => {
        const stateData = data?.states[hoveredState];
        return (
          <div
            className="fixed z-50 pointer-events-none px-3 py-2.5 text-xs"
            style={{
              left: tooltipPos.x + 12, top: tooltipPos.y - 10,
              background: "rgba(13, 13, 20, 0.95)",
              border: "1px solid rgba(0, 212, 255, 0.3)",
              borderRadius: 4, color: "#e2e8f0",
              fontFamily: "var(--font-mono)", letterSpacing: "0.05em", minWidth: 180,
            }}
          >
            <div className="font-bold text-[var(--color-cyan)] tracking-wider mb-1.5">
              {hoveredState.toUpperCase()}
            </div>
            {stateData ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-dim)]">
                    {getWmoIcon(stateData.current.weatherCode)} {getWmoLabel(stateData.current.weatherCode)}
                  </span>
                  <span className="font-bold text-sm" style={{ color: getTempColor(stateData.current.temperature) }}>
                    {stateData.current.temperature.toFixed(1)}°C
                  </span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]">
                  <span>Feels like</span><span>{stateData.current.apparentTemperature.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]">
                  <span>Humidity</span><span>{stateData.current.humidity}%</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]">
                  <span>Wind</span>
                  <span>{stateData.current.windSpeed.toFixed(1)} km/h {getWindDir(stateData.current.windDirection)}</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]">
                  <span>Rain</span><span>{stateData.current.precipitation.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between text-[var(--color-text-dim)]">
                  <span>Pressure</span><span>{stateData.current.pressure.toFixed(0)} hPa</span>
                </div>
              </div>
            ) : (
              <div className="text-[var(--color-text-dim)]">Loading...</div>
            )}
          </div>
        );
      })()}

      {/* Legend — desktop */}
      <div className="absolute bottom-5 left-5 text-[10px] text-[var(--color-text-muted)] space-y-1.5 hidden lg:block">
        <div className="tracking-[2px] mb-2" style={{ color: "rgba(0, 212, 255, 0.75)" }}>LIVE TEMPERATURE</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(239, 68, 68, 0.5)" }} />{"\u2265"} 35°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(255, 149, 0, 0.45)" }} />33–34°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(255, 200, 50, 0.35)" }} />31–32°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(0, 212, 255, 0.35)" }} />28–30°C</div>
        <div className="flex items-center gap-2"><div className="w-4 h-2.5 rounded-sm" style={{ background: "rgba(0, 180, 230, 0.25)" }} />{"\u2264"} 27°C</div>
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--color-green)" }} />
            <span className="text-[10px]">OPEN-METEO (REAL-TIME)</span>
          </div>
        </div>
      </div>

      {/* Coordinates — desktop */}
      <div className="absolute top-4 left-4 text-xs tracking-wider hidden lg:block" style={{ color: "var(--color-text-muted)" }}>
        3.1390&deg;N 101.6869&deg;E
      </div>

      {/* Last updated */}
      {data && (
        <div className="absolute bottom-5 right-5 text-[10px] text-[var(--color-text-dim)] hidden lg:block">
          UPDATED: {new Date(data.fetchedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} MYT
        </div>
      )}
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

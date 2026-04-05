"use client";

import { useEffect, useState, useCallback } from "react";
import type { CurrentWeatherResponse } from "@/lib/data/weather-types";

/** WMO weather code → description + icon */
function getWmoDescription(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Clear sky", icon: "\u2600\uFE0F" };
  if (code <= 3) return { label: "Partly cloudy", icon: "\u26C5" };
  if (code <= 49) return { label: "Fog", icon: "\u{1F32B}\uFE0F" };
  if (code <= 59) return { label: "Drizzle", icon: "\u{1F326}\uFE0F" };
  if (code <= 69) return { label: "Rain", icon: "\u{1F327}\uFE0F" };
  if (code <= 79) return { label: "Snow", icon: "\u2744\uFE0F" };
  if (code <= 84) return { label: "Rain showers", icon: "\u{1F326}\uFE0F" };
  if (code <= 94) return { label: "Thunderstorm", icon: "\u{1F329}\uFE0F" };
  return { label: "Thunderstorm w/ hail", icon: "\u{1F329}\uFE0F" };
}

function getWindDirection(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function getUvLabel(uv: number): { label: string; color: string } {
  if (uv <= 2) return { label: "LOW", color: "var(--color-green)" };
  if (uv <= 5) return { label: "MOD", color: "var(--color-amber)" };
  if (uv <= 7) return { label: "HIGH", color: "var(--color-amber)" };
  return { label: "EXTREME", color: "var(--color-red)" };
}

function getTempColor(temp: number): string {
  if (temp >= 35) return "var(--color-red)";
  if (temp >= 32) return "var(--color-amber)";
  return "var(--color-cyan)";
}

interface LiveConditionsProps {
  selectedState: string | null;
}

export default function LiveConditions({ selectedState }: LiveConditionsProps) {
  const [data, setData] = useState<CurrentWeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrent = useCallback(async (state: string | null) => {
    setLoading(true);
    try {
      const param = state ? `?state=${encodeURIComponent(state)}` : "";
      const res = await fetch(`/api/weather/current${param}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrent(selectedState);
    const interval = setInterval(() => fetchCurrent(selectedState), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedState, fetchCurrent]);

  if (!data) {
    return (
      <div
        className="flex items-center gap-4 px-5 py-2 shrink-0"
        style={{
          background: "linear-gradient(90deg, rgba(0,212,255,0.03) 0%, transparent 100%)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">LIVE</span>
        <span className="text-[10px] text-[var(--color-text-dim)]">
          {loading ? "Fetching live conditions..." : "Live data unavailable"}
        </span>
      </div>
    );
  }

  const c = data.current;
  const wmo = getWmoDescription(c.weatherCode);
  const uv = getUvLabel(c.uvIndex);

  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex flex-col px-2 lg:px-4 py-1.5 lg:py-2 border-r border-[var(--color-border)] shrink-0">
      <span className="text-[10px] lg:text-[10px] tracking-[1px] text-[var(--color-text-dim)]">{label}</span>
      <span className="text-[10px] lg:text-[11px] text-[var(--color-text-bright)]" style={color ? { color, fontWeight: 700 } : undefined}>
        {value}
      </span>
    </div>
  );

  return (
    <div
      className="shrink-0"
      style={{
        background: "linear-gradient(90deg, rgba(0,212,255,0.04) 0%, transparent 100%)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Mobile: compact 2-row layout */}
      <div className="lg:hidden">
        {/* Row 1: location + temp */}
        <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full pulse-dot shrink-0"
            style={{ background: "var(--color-green)", boxShadow: "0 0 6px var(--color-green)" }}
          />
          <span className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">LIVE</span>
          <span className="text-[10px] text-[var(--color-text-bright)] font-bold tracking-wider truncate">
            {data.locationName.toUpperCase()}
          </span>
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="text-sm">{wmo.icon}</span>
            <span className="text-base font-bold" style={{ color: getTempColor(c.temperature) }}>
              {c.temperature.toFixed(1)}°
            </span>
            <span className="text-[10px] text-[var(--color-text-dim)]">{wmo.label}</span>
          </div>
        </div>
        {/* Row 2: scrollable stats */}
        <div className="flex overflow-x-auto scrollbar-none px-1 pb-1.5">
          <StatItem label="HUMIDITY" value={`${c.humidity}%`} />
          <StatItem label="WIND" value={`${c.windSpeed.toFixed(1)} ${getWindDirection(c.windDirection)}`} />
          <StatItem label="UV" value={`${c.uvIndex.toFixed(1)} ${uv.label}`} color={uv.color} />
          <StatItem label="RAIN" value={`${c.precipitation.toFixed(1)} mm`} />
          <StatItem label="CLOUD" value={`${c.cloudCover}%`} />
          <StatItem label="PRESS" value={`${c.pressure.toFixed(0)} hPa`} />
          <div className="flex flex-col px-2 py-1.5 shrink-0">
            <span className="text-[10px] tracking-[1px] text-[var(--color-text-dim)]">FEELS</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{c.apparentTemperature.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      {/* Desktop: original single-row layout */}
      <div className="hidden lg:flex items-center gap-0 px-5 py-0 overflow-x-auto">
        <div className="flex items-center gap-2 pr-4 py-2 border-r border-[var(--color-border)] shrink-0">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: "var(--color-green)", boxShadow: "0 0 6px var(--color-green)" }}
          />
          <span className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">LIVE</span>
          <span className="text-[10px] text-[var(--color-text-bright)] font-bold tracking-wider">
            {data.locationName.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-r border-[var(--color-border)] shrink-0">
          <span className="text-sm">{wmo.icon}</span>
          <span className="text-lg font-bold" style={{ color: getTempColor(c.temperature) }}>
            {c.temperature.toFixed(1)}°
          </span>
          <div className="flex flex-col ml-1">
            <span className="text-[10px] text-[var(--color-text-dim)] leading-none">FEELS</span>
            <span className="text-[10px] text-[var(--color-text-muted)] leading-none">{c.apparentTemperature.toFixed(1)}°</span>
          </div>
        </div>

        <StatItem label="CONDITION" value={wmo.label} />
        <StatItem label="HUMIDITY" value={`${c.humidity}%`} />
        <StatItem label="WIND" value={`${c.windSpeed.toFixed(1)} km/h ${getWindDirection(c.windDirection)}`} />
        <StatItem label="PRESSURE" value={`${c.pressure.toFixed(0)} hPa`} />
        <StatItem label="UV INDEX" value={`${c.uvIndex.toFixed(1)} ${uv.label}`} color={uv.color} />
        <StatItem label="CLOUD" value={`${c.cloudCover}%`} />

        <div className="flex flex-col px-4 py-2 shrink-0">
          <span className="text-[10px] tracking-[1px] text-[var(--color-text-dim)]">RAIN</span>
          <span className="text-[10px] text-[var(--color-text-bright)]">{c.precipitation.toFixed(1)} mm</span>
        </div>

        <div className="ml-auto text-[10px] text-[var(--color-text-dim)] shrink-0 pl-4">
          OPEN-METEO {c.time.slice(11)}
        </div>
      </div>
    </div>
  );
}

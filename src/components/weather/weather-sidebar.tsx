"use client";

import { useMemo } from "react";
import type {
  ForecastEntry,
  WarningEntry,
  EarthquakeEntry,
  AirQualityData,
} from "@/lib/data/weather-types";
import { getAirQualityColor } from "@/lib/data/weather-types";

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

function getTempColor(temp: number): string {
  if (temp >= 35) return "var(--color-red)";
  if (temp >= 32) return "var(--color-amber)";
  return "var(--color-cyan)";
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "DANGER": return "var(--color-red)";
    case "WARNING": return "var(--color-amber)";
    case "ADVISORY": return "var(--color-cyan)";
    default: return "var(--color-text-muted)";
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case "THUNDERSTORM": return "\u{1F329}\uFE0F";
    case "RAIN": return "\u{1F327}\uFE0F";
    case "WINDSEA": return "\u{1F30A}";
    case "CYCLONE": return "\u{1F300}";
    case "QUAKETSUNAMI": return "\u{1F30D}";
    default: return "\u26A0\uFE0F";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getQuakeColor(magnitude: number): string {
  if (magnitude >= 6) return "var(--color-red)";
  if (magnitude >= 5) return "var(--color-amber)";
  return "var(--color-text-muted)";
}

interface WeatherSidebarProps {
  forecasts: ForecastEntry[];
  warnings: WarningEntry[];
  earthquakes: EarthquakeEntry[];
  airQuality: AirQualityData;
  selectedState: string | null;
  activeTab: string;
  variant?: "desktop" | "mobile";
}

export default function WeatherSidebar({
  forecasts,
  warnings,
  earthquakes,
  airQuality,
  selectedState,
  activeTab,
  variant = "desktop",
}: WeatherSidebarProps) {
  // Get forecasts for the selected state (all dates)
  const stateForecasts = useMemo(() => {
    if (!selectedState) return [];
    return forecasts
      .filter((f) => f.location.state === selectedState)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [forecasts, selectedState]);

  const activeWarnings = useMemo(
    () => warnings.filter((w) => new Date(w.validTo) > new Date()),
    [warnings]
  );

  // Warnings relevant to selected state
  const stateWarnings = useMemo(() => {
    if (!selectedState) return activeWarnings;
    return activeWarnings.filter((w) =>
      w.affectedAreas.some(
        (area) => area.toLowerCase() === selectedState.toLowerCase()
      )
    );
  }, [activeWarnings, selectedState]);

  const displayName = selectedState?.toUpperCase() ?? "MALAYSIA";
  const dateLabels = ["TODAY", "TOMORROW", "DAY 3"];

  return (
    <div
      className={
        variant === "mobile"
          ? "flex flex-col"
          : "w-[380px] hidden lg:flex flex-col overflow-y-auto shrink-0"
      }
      style={
        variant === "mobile"
          ? {}
          : {
              background: "linear-gradient(180deg, #0d0d14 0%, #0a0a0f 100%)",
              borderLeft: "1px solid rgba(0, 212, 255, 0.1)",
            }
      }
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <div className="text-[12px] tracking-[3px] text-[var(--color-cyan)] mb-1">
          {selectedState ? "STATE WEATHER BRIEF" : "NATIONAL WEATHER"}
          <span className="text-[var(--color-text-dim)] ml-2">/ METMALAYSIA</span>
        </div>
        <div className="text-[22px] font-bold text-[var(--color-text-bright)] tracking-wider">
          {displayName}
        </div>
        <div className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
          {selectedState
            ? "Click map to view another state"
            : "Select a state on the map"}
        </div>
      </div>

      {/* State forecast */}
      {selectedState && stateForecasts.length > 0 ? (
        <div className="border-b border-[var(--color-border)]">
          <div className="px-4 py-2.5">
            <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
              3-DAY FORECAST
            </div>
          </div>
          <div className="space-y-0">
            {stateForecasts.map((f, i) => (
              <div
                key={f.date}
                className="px-4 py-3 border-t border-[var(--color-border)]"
                style={{ background: i === 0 ? "rgba(0, 212, 255, 0.03)" : "transparent" }}
              >
                {/* Date + summary */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-wider text-[var(--color-text-bright)] font-bold">
                      {dateLabels[i] ?? f.date.slice(5)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      {f.date.slice(5)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-lg font-bold"
                      style={{ color: getTempColor(f.maxTemp) }}
                    >
                      {f.maxTemp}°
                    </span>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      / {f.minTemp}°
                    </span>
                  </div>
                </div>

                {/* Time-of-day breakdown */}
                <div className="space-y-1">
                  {[
                    { label: "MORN", value: f.morningForecast },
                    { label: "AFTN", value: f.afternoonForecast },
                    { label: "NITE", value: f.nightForecast },
                  ].map((slot) => (
                    <div key={slot.label} className="flex items-center gap-2">
                      <span className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] w-7 shrink-0">
                        {slot.label}
                      </span>
                      <span className="text-sm">{getWeatherIcon(slot.value)}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                        {slot.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !selectedState ? (
        <div className="px-4 py-6 border-b border-[var(--color-border)] text-center">
          <div className="text-[var(--color-text-dim)] text-sm mb-1">
            {"\u{1F321}\uFE0F"}
          </div>
          <div className="text-[10px] text-[var(--color-text-dim)]">
            Click a state to view its 3-day forecast
          </div>
        </div>
      ) : null}

      {/* Air quality detail — shown when air quality tab is active */}
      {activeTab === "airquality" && (() => {
        const reading = selectedState
          ? airQuality.readings.find((r) => r.state === selectedState)
          : null;
        const allReadings = airQuality.readings;
        const avgApi = Math.round(allReadings.reduce((sum, r) => sum + r.apiValue, 0) / allReadings.length);

        return (
          <div className="border-b border-[var(--color-border)]">
            <div className="px-4 py-2.5">
              <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
                AIR QUALITY
              </div>
            </div>

            {reading ? (
              <div className="px-4 pb-4">
                {/* Status banner */}
                <div
                  className="rounded-sm p-3 mb-3 text-center"
                  style={{
                    background: `${getAirQualityColor(reading.status)}10`,
                    border: `1px solid ${getAirQualityColor(reading.status)}30`,
                  }}
                >
                  <div
                    className="text-2xl font-bold"
                    style={{ color: getAirQualityColor(reading.status) }}
                  >
                    {reading.apiValue}
                  </div>
                  <div
                    className="text-[10px] font-bold tracking-wider"
                    style={{ color: getAirQualityColor(reading.status) }}
                  >
                    {reading.status.replace("_", " ")}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-dim)] mt-1">
                    {reading.stationName}
                  </div>
                </div>

                {/* Pollutant breakdown */}
                <div className="space-y-2">
                  {[
                    { label: "PM2.5", value: `${reading.pm25} µg/m³`, dominant: reading.dominantPollutant === "PM2.5" },
                    { label: "PM10", value: `${reading.pm10} µg/m³`, dominant: reading.dominantPollutant === "PM10" },
                    { label: "O\u2083", value: `${reading.o3} ppb`, dominant: reading.dominantPollutant === "O3" },
                    { label: "CO", value: `${reading.co} ppm`, dominant: false },
                    { label: "SO\u2082", value: `${reading.so2} ppb`, dominant: false },
                    { label: "NO\u2082", value: `${reading.no2} ppb`, dominant: false },
                  ].map((p) => (
                    <div key={p.label} className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--color-text-muted)] flex items-center gap-1.5">
                        {p.label}
                        {p.dominant && (
                          <span className="text-[10px] px-1 py-0.5 rounded-sm bg-[rgba(255,149,0,0.15)] text-[var(--color-amber)]">
                            DOMINANT
                          </span>
                        )}
                      </span>
                      <span className="text-[var(--color-text-bright)] font-bold">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-4 pb-4">
                <div
                  className="rounded-sm p-3 text-center"
                  style={{ background: "rgba(13, 13, 20, 0.8)", border: "1px solid var(--color-border)" }}
                >
                  <div className="text-[var(--color-text-muted)] text-sm mb-0.5">
                    National Avg: <span className="font-bold text-[var(--color-text-bright)]">{avgApi}</span>
                  </div>
                  <div className="text-[10px] text-[var(--color-text-dim)]">
                    Click a state for detailed pollutant readings
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Warnings section — always visible */}
      <div className="flex-1">
        <div className="px-4 py-2.5 flex items-center gap-2">
          <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
            {selectedState ? "STATE WARNINGS" : "ACTIVE WARNINGS"}
          </div>
          {(selectedState ? stateWarnings : activeWarnings).length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "var(--color-red)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {(selectedState ? stateWarnings : activeWarnings).length}
            </span>
          )}
        </div>

        {(selectedState ? stateWarnings : activeWarnings).length === 0 ? (
          <div className="px-4 pb-4">
            <div
              className="border border-[var(--color-border)] rounded-sm p-4 text-center"
              style={{ background: "rgba(13, 13, 20, 0.8)" }}
            >
              <div className="text-[var(--color-green)] text-sm mb-0.5">
                {"\u2713"} ALL CLEAR
              </div>
              <div className="text-[10px] text-[var(--color-text-dim)]">
                No active warnings{selectedState ? ` for ${selectedState}` : ""}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            {(selectedState ? stateWarnings : activeWarnings).map((w) => {
              const severityColor = getSeverityColor(w.severity);
              return (
                <div
                  key={w.id}
                  className="border rounded-sm p-3"
                  style={{
                    background: "rgba(13, 13, 20, 0.8)",
                    borderColor: severityColor,
                    borderLeftWidth: "3px",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{getCategoryIcon(w.category)}</span>
                    <span className="text-[10px] font-bold text-[var(--color-text-bright)] tracking-wider flex-1">
                      {w.title.toUpperCase()}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold"
                      style={{
                        background: `${severityColor}15`,
                        color: severityColor,
                        border: `1px solid ${severityColor}40`,
                      }}
                    >
                      {w.severity}
                    </span>
                  </div>

                  <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mb-2">
                    {w.text}
                  </p>

                  {w.instruction && (
                    <div
                      className="text-[10px] p-1.5 rounded-sm mb-2"
                      style={{
                        background: `${severityColor}08`,
                        borderLeft: `2px solid ${severityColor}60`,
                        color: "var(--color-text)",
                      }}
                    >
                      {w.instruction}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {w.affectedAreas.map((area) => (
                      <span
                        key={area}
                        className="text-[10px] px-1 py-0.5 rounded-sm"
                        style={{
                          background:
                            selectedState && area.toLowerCase() === selectedState.toLowerCase()
                              ? "rgba(0, 212, 255, 0.15)"
                              : "rgba(0, 212, 255, 0.05)",
                          border: "1px solid rgba(0, 212, 255, 0.12)",
                          color: "var(--color-text-dim)",
                        }}
                      >
                        {area.toUpperCase()}
                      </span>
                    ))}
                  </div>

                  <div className="text-[10px] text-[var(--color-text-dim)]">
                    VALID: {formatTime(w.validFrom)} — {formatTime(w.validTo)} MYT
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Seismic activity — always visible */}
      <div className="border-t border-[var(--color-border)]">
        <div className="px-4 py-2.5">
          <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
            RECENT SEISMIC ACTIVITY
          </div>
        </div>

        <div className="px-4 pb-4 space-y-2">
          {earthquakes.length === 0 ? (
            <div
              className="border border-[var(--color-border)] rounded-sm p-3 text-center"
              style={{ background: "rgba(13, 13, 20, 0.8)" }}
            >
              <div className="text-[10px] text-[var(--color-text-dim)]">
                No recent seismic activity
              </div>
            </div>
          ) : (
            earthquakes.map((eq, i) => (
              <div
                key={i}
                className="border border-[var(--color-border)] rounded-sm p-3 flex items-center gap-3 transition-all hover:border-[var(--color-border-bright)]"
                style={{ background: "rgba(13, 13, 20, 0.8)" }}
              >
                {/* Magnitude circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    border: `2px solid ${getQuakeColor(eq.magnitude)}`,
                    background: `${getQuakeColor(eq.magnitude)}10`,
                  }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: getQuakeColor(eq.magnitude) }}
                  >
                    {eq.magnitude.toFixed(1)}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[var(--color-text-bright)] font-bold truncate">
                    {eq.location}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
                    {formatDate(eq.datetime)} {formatTime(eq.datetime)} MYT
                  </div>
                  <div className="flex gap-2 mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    <span>DEPTH: {eq.depth} KM</span>
                    <span>{eq.magnitudeType.toUpperCase()}</span>
                    {eq.status !== "NORMAL" && (
                      <span
                        className="px-1 rounded-sm"
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          color: "var(--color-red)",
                        }}
                      >
                        {eq.status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

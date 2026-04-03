"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { WeatherData, WeatherSubTab } from "@/lib/data/weather-types";
import LiveConditions from "./live-conditions";
import RadarPanel from "./radar-panel";
import WeatherSidebar from "./weather-sidebar";
import BottomSheet from "@/components/ui/bottom-sheet";

const WeatherMap = dynamic(() => import("./weather-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING MAP...
    </div>
  ),
});

const LiveWeatherMap = dynamic(() => import("./live-weather-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING LIVE MAP...
    </div>
  ),
});

const AirQualityMap = dynamic(() => import("./air-quality-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING AIR QUALITY...
    </div>
  ),
});

type MapSubTab = "live" | "forecast" | "radar" | "airquality";

const MAP_TABS: Array<{ key: MapSubTab; label: string }> = [
  { key: "live", label: "LIVE" },
  { key: "forecast", label: "FORECAST" },
  { key: "radar", label: "RADAR / SAT" },
  { key: "airquality", label: "AIR QUALITY" },
];

export default function WeatherView() {
  const [activeTab, setActiveTab] = useState<MapSubTab>("live");
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("/api/weather");
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // Will show loading state
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Unique dates from forecast data
  const dates = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.forecasts.map((f) => f.date))].sort();
  }, [data]);

  const selectedDate = dates[selectedDateIndex] ?? "";

  // Active warning count for alert bar
  const activeWarningCount = data
    ? data.warnings.filter((w) => new Date(w.validTo) > new Date()).length
    : 0;

  const dateLabels = ["TODAY", "TOMORROW", "DAY 3"];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--color-text-dim)] text-xs tracking-wider mb-1">
            FETCHING WEATHER DATA...
          </div>
          <div className="text-[10px] text-[var(--color-text-dim)]">
            data.gov.my
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--color-red)] text-xs tracking-wider mb-1">
            DATA UNAVAILABLE
          </div>
          <div className="text-[10px] text-[var(--color-text-dim)]">
            Could not fetch weather data
          </div>
        </div>
      </div>
    );
  }

  const displayName = selectedState?.toUpperCase() ?? "MALAYSIA";

  // Tab buttons (shared between mobile strip and desktop overlay)
  const tabButtons = MAP_TABS.map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={`px-2 lg:px-3 py-1 text-[10px] lg:text-[10px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${
        activeTab === tab.key
          ? "bg-[rgba(0,212,255,0.12)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.1)]"
          : "border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)] bg-[rgba(10,10,15,0.7)] backdrop-blur-sm"
      }`}
    >
      {tab.label}
    </button>
  ));

  // Date buttons (forecast mode only)
  const dateButtons =
    activeTab === "forecast" && dates.length > 1
      ? dates.map((date, i) => (
          <button
            key={date}
            onClick={() => setSelectedDateIndex(i)}
            className={`px-2.5 py-1 text-[10px] lg:text-[10px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${
              selectedDateIndex === i
                ? "bg-[rgba(0,212,255,0.12)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                : "border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)] bg-[rgba(10,10,15,0.7)] backdrop-blur-sm"
            }`}
          >
            {dateLabels[i] ?? `DAY ${i + 1}`}
          </button>
        ))
      : null;

  // Map content (shared)
  const mapContent = (
    <>
      {activeTab === "live" && (
        <LiveWeatherMap
          selectedState={selectedState}
          onStateSelect={setSelectedState}
          sheetSnap={sheetSnap}
        />
      )}
      {activeTab === "forecast" && (
        <WeatherMap
          forecasts={data.forecasts}
          selectedDate={selectedDate}
          selectedState={selectedState}
          onStateSelect={setSelectedState}
          sheetSnap={sheetSnap}
        />
      )}
      {activeTab === "radar" && <RadarPanel radar={data.radar} />}
      {activeTab === "airquality" && (
        <AirQualityMap
          airQuality={data.airQuality}
          selectedState={selectedState}
          onStateSelect={setSelectedState}
          sheetSnap={sheetSnap}
        />
      )}
    </>
  );

  // Sidebar props (shared)
  const sidebarProps = {
    forecasts: data.forecasts,
    warnings: data.warnings,
    earthquakes: data.earthquakes,
    airQuality: data.airQuality,
    selectedState,
    activeTab,
  };

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0">
          {/* Warning alert bar */}
          {activeWarningCount > 0 && (
            <div
              className="flex items-center gap-2 px-4 py-1.5 shrink-0"
              style={{
                background: "rgba(255, 149, 0, 0.08)",
                borderBottom: "1px solid rgba(255, 149, 0, 0.2)",
              }}
            >
              <span className="text-sm">{"\u26A0\uFE0F"}</span>
              <span className="text-[10px] tracking-wider text-[var(--color-amber)] font-bold">
                {activeWarningCount} ACTIVE WARNING{activeWarningCount > 1 ? "S" : ""}
              </span>
              <span className="text-[10px] text-[var(--color-text-dim)] hidden sm:inline">
                — see sidebar for details
              </span>
            </div>
          )}

          {/* Mobile: tab strip */}
          <div
            className="lg:hidden shrink-0"
            style={{
              background: "rgba(13, 13, 20, 0.9)",
              borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
            }}
          >
            <div className="flex flex-nowrap gap-1.5 px-3 pt-2 pb-1.5 overflow-x-auto scrollbar-none">
              {tabButtons}
            </div>
            {dateButtons && (
              <div className="flex gap-1.5 px-3 pb-2">
                {dateButtons}
              </div>
            )}
          </div>

          {/* Live conditions strip */}
          <LiveConditions selectedState={selectedState} />

          {/* Map content */}
          <div className="flex-1 relative min-h-0 flex flex-col">
            {mapContent}

            {/* Desktop: sub-tab toggles + date selector (top-right overlay) */}
            <div className="absolute top-4 right-4 hidden lg:flex flex-col items-end gap-1.5 z-10">
              <div className="flex gap-1.5">
                {tabButtons}
              </div>
              {dateButtons && (
                <div className="flex gap-1.5">
                  {dateButtons}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop: right sidebar */}
        <WeatherSidebar {...sidebarProps} />
      </div>

      {/* Desktop: bottom summary bar */}
      <div
        className="h-11 hidden lg:flex items-center px-5 gap-5 shrink-0 relative z-20"
        style={{
          background: "linear-gradient(180deg, #0d0d14 0%, #111118 100%)",
          borderTop: "1px solid rgba(0, 212, 255, 0.1)",
        }}
      >
        {/* National temp range */}
        {data.forecasts.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <span className="tracking-[1.5px] text-[var(--color-cyan)]">NATIONAL</span>
              <span>
                {Math.min(...data.forecasts.map((f) => f.minTemp))}°–
                {Math.max(...data.forecasts.map((f) => f.maxTemp))}°C
              </span>
            </div>
            <span className="text-[var(--color-text-dim)] opacity-30">|</span>
          </>
        )}

        {/* Active warnings */}
        <div className="flex items-center gap-1.5 text-[10px]">
          {activeWarningCount > 0 ? (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  background: "var(--color-amber)",
                  boxShadow: "0 0 6px var(--color-amber)",
                }}
              />
              <span className="text-[var(--color-amber)]">
                {activeWarningCount} ACTIVE WARNING{activeWarningCount > 1 ? "S" : ""}
              </span>
            </>
          ) : (
            <span className="text-[var(--color-text-dim)]">NO ACTIVE WARNINGS</span>
          )}
        </div>

        <span className="text-[var(--color-text-dim)] opacity-30">|</span>

        {/* Latest earthquake */}
        {data.earthquakes.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <span className="tracking-[1.5px] text-[var(--color-text-dim)]">SEISMIC</span>
              <span>
                M{data.earthquakes[0].magnitude} — {data.earthquakes[0].location}
              </span>
            </div>
            <span className="text-[var(--color-text-dim)] opacity-30">|</span>
          </>
        )}

        {/* Air quality summary */}
        {data.airQuality.readings.length > 0 && (() => {
          const maxApi = Math.max(...data.airQuality.readings.map((r) => r.apiValue));
          const avgApi = Math.round(
            data.airQuality.readings.reduce((sum, r) => sum + r.apiValue, 0) /
              data.airQuality.readings.length
          );
          const aqColor = maxApi > 100 ? "var(--color-amber)" : "var(--color-green)";
          return (
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
              <span className="tracking-[1.5px] text-[var(--color-text-dim)]">AQI</span>
              <span>
                AVG {avgApi}
              </span>
              <span style={{ color: aqColor }}>
                PEAK {maxApi}
              </span>
            </div>
          );
        })()}

        {/* Last fetch time */}
        <div className="ml-auto text-[10px] text-[var(--color-text-dim)]">
          {new Date(data.fetchedAt).toLocaleTimeString("en-MY", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          MYT
        </div>
      </div>

      {/* Mobile: bottom sheet with weather sidebar content */}
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        peek={
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--color-text-bright)] tracking-wider truncate">
                {displayName}
              </div>
              <div className="text-[10px] tracking-[1.5px] text-[var(--color-text-dim)]">
                {selectedState ? "STATE WEATHER" : "NATIONAL WEATHER"} / METMALAYSIA
              </div>
            </div>
            {activeWarningCount > 0 && (
              <div className="shrink-0 text-right">
                <div className="text-[10px] tracking-[1.5px] text-[var(--color-amber)]">
                  {activeWarningCount} WARNING{activeWarningCount > 1 ? "S" : ""}
                </div>
              </div>
            )}
          </div>
        }
      >
        <WeatherSidebar {...sidebarProps} variant="mobile" />
      </BottomSheet>
    </>
  );
}

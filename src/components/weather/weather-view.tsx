"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type { WeatherData, WeatherSubTab } from "@/lib/data/weather-types";
import { reportFeedStatus } from "@/lib/feed-status";
import LiveConditions from "./live-conditions";
import RadarPanel from "./radar-panel";
import WeatherSidebar from "./weather-sidebar";
import BottomSheet from "@/components/ui/bottom-sheet";
import PillButton from "@/components/ui/pill-button";
import { PeekHeader } from "@/components/ui/side-panel";
import { getFlagSrc } from "@/lib/data/states";
import EnvironmentView from "./environment-view";

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

type MapSubTab = "live" | "forecast" | "radar" | "airquality" | "rivers";

const MAP_TABS: Array<{ key: MapSubTab; label: string }> = [
  { key: "live", label: "LIVE" },
  { key: "forecast", label: "FORECAST" },
  { key: "radar", label: "RADAR / SAT" },
  { key: "airquality", label: "AIR QUALITY" },
  { key: "rivers", label: "RIVERS & FLOODS" },
];

export default function WeatherView() {
  const [activeTab, setActiveTab] = useState<MapSubTab>("live");
  const [airView, setAirView] = useState<"summary" | "fires">("summary");
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  // Peek first: the weather tab stacks more strips above the map than other tabs
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("peek");

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    // Up to 2 quick automatic retries with short backoff before declaring failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // no-store: each poll revalidates against the server (which still serves
        // its short-lived edge cache) instead of the browser HTTP cache, so new
        // seismic activity surfaces promptly.
        const res = await fetch("/api/weather", { cache: "no-store" });
        if (res.ok) {
          const weather: WeatherData = await res.json();
          setData(weather);
          setLoading(false);
          reportFeedStatus("weather", weather.feedStatus?.warnings === true && weather.feedStatus?.floods === true);
          return;
        }
      } catch {
        // Fall through to backoff
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    setLoading(false);
    setData((previous) => previous ? { ...previous, feedStatus: { warnings: false, floods: false } } : previous);
    reportFeedStatus("weather", false);
  }, []);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

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

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--color-text-dim)] text-xs tracking-wider mb-1">
            FETCHING WEATHER DATA...
          </div>
          <div className="text-xs text-[var(--color-text-dim)]">
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
          <div className="text-xs text-[var(--color-text-dim)]">
            Could not fetch weather data
          </div>
          <button
            onClick={fetchWeather}
            className="mt-4 px-4 py-2 min-h-11 lg:min-h-9 text-xs tracking-[0.08em] border rounded-md transition-colors cursor-pointer border-[var(--color-border-mid)] text-[var(--color-cyan)] hover:border-[var(--color-cyan)] hover:bg-[var(--color-cyan-soft)]"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const displayName = selectedState?.toUpperCase() ?? "MALAYSIA";

  // Tab buttons (shared between mobile strip and desktop overlay)
  const tabButtons = MAP_TABS.map((tab) => (
    <PillButton
      key={tab.key}
      overlay
      active={activeTab === tab.key}
      onClick={() => setActiveTab(tab.key)}
    >
      {tab.label}
    </PillButton>
  ));

  const airPills = activeTab === "airquality" ? <><PillButton overlay active={airView === "summary"} onClick={() => setAirView("summary")}>STATE SUMMARY</PillButton><PillButton overlay active={airView === "fires"} onClick={() => setAirView("fires")}>FIRE & HAZE</PillButton></> : null;
  // Desktop: every sub-tab floats its rows at the map's top-right, so the tabs never move
  const overlayRows = (
    <>
      <div className="flex gap-1.5">{tabButtons}</div>
      {airPills && <div className="flex gap-1.5">{airPills}</div>}
    </>
  );
  // Rivers and Fire & Haze use the live tile map, framed like the other sub-tabs
  const isEnvironment = activeTab === "rivers" || (activeTab === "airquality" && airView === "fires");

  // Date buttons (forecast mode only)
  const dateButtons =
    activeTab === "forecast" && dates.length > 1
      ? dates.map((date, i) => (
          <PillButton
            key={date}
            overlay
            active={selectedDateIndex === i}
            onClick={() => setSelectedDateIndex(i)}
          >
            {dateLabels[i] ?? `DAY ${i + 1}`}
          </PillButton>
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

  // Flood alert count for combined alert bar
  const floodAlertCount = data ? data.floodAlerts.stations.length : 0;
  const warningsAvailable = data.feedStatus?.warnings === true;
  const floodsAvailable = data.feedStatus?.floods === true;

  // Sidebar props (shared)
  const sidebarProps = {
    forecasts: data.forecasts,
    warnings: data.warnings,
    earthquakes: data.earthquakes,
    airQuality: data.airQuality,
    floodAlerts: data.floodAlerts,
    warningsAvailable,
    floodsAvailable,
    selectedState,
    activeTab,
  };

  // Strips above the map, the same on every sub-tab
  const topStrips = (
    <>
          {(!warningsAvailable || !floodsAvailable) && (
            <div role="status" className="px-4 py-2 text-xs text-[var(--color-amber)] border-b border-[var(--color-border)] shrink-0">
              {!warningsAvailable && !floodsAvailable ? "WARNING AND FLOOD DATA UNAVAILABLE" : !warningsAvailable ? "WARNING DATA UNAVAILABLE" : "FLOOD DATA UNAVAILABLE"}
            </div>
          )}
          {/* Warning + flood alert bar */}
          {(activeWarningCount > 0 || floodAlertCount > 0) && (
            <div
              className="flex items-center gap-2 px-4 py-1.5 shrink-0"
              style={{
                background: "rgba(255, 149, 0, 0.08)",
                borderBottom: "1px solid rgba(255, 149, 0, 0.2)",
              }}
            >
              <span className="text-sm" aria-hidden="true">{"\u26A0\uFE0F"}</span>
              {activeWarningCount > 0 && (
                <span className="text-xs tracking-wider text-[var(--color-amber)] font-bold">
                  {activeWarningCount} WARNING{activeWarningCount > 1 ? "S" : ""}
                </span>
              )}
              {activeWarningCount > 0 && floodAlertCount > 0 && (
                <span className="text-[var(--color-text-dim)] opacity-30">|</span>
              )}
              {floodAlertCount > 0 && (
                <span className="text-xs tracking-wider text-[var(--color-cyan)] font-bold">
                  {"\uD83C\uDF0A"} {floodAlertCount} FLOOD ALERT{floodAlertCount > 1 ? "S" : ""}
                </span>
              )}
              <span className="text-xs text-[var(--color-text-dim)] hidden sm:inline">
                — see sidebar for details
              </span>
            </div>
          )}

          {/* Mobile: tab strip */}
          <div
            className="lg:hidden shrink-0"
            style={{
              background: "rgba(13, 24, 30, 0.96)",
              borderBottom: "1px solid var(--color-border-faint)",
            }}
          >
            <div className="flex flex-nowrap gap-1.5 px-3 pt-2 pb-1.5 overflow-x-auto scrollbar-none">
              {tabButtons}
            </div>
            {(dateButtons || airPills) && (
              <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-none">
                {dateButtons ?? airPills}
              </div>
            )}
          </div>

          {/* Live conditions strip */}
          <LiveConditions selectedState={selectedState} />
    </>
  );

  return (
    <>
      {isEnvironment ? (
        <EnvironmentView
          key={activeTab}
          mode={activeTab === "rivers" ? "rivers" : "air"}
          top={topStrips}
          tabs={overlayRows}
        />
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0 overflow-hidden">
          {topStrips}

          {/* Map content */}
          <div className="flex-1 relative min-h-0 flex flex-col">
            {mapContent}

            {/* Desktop: sub-tab toggles + date / air view selector (top-right overlay) */}
            <div className="absolute top-4 right-4 hidden lg:flex flex-col items-end gap-1.5 z-10">
              {overlayRows}
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
      )}

      {/* Desktop: bottom summary bar */}
      <div
        className="h-11 hidden lg:flex items-center px-5 gap-5 shrink-0 relative z-20"
        style={{
          background: "linear-gradient(180deg, var(--color-bg-panel) 0%, var(--color-bg-card) 100%)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        {/* National temp range */}
        {data.forecasts.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="tracking-[0.06em] text-[var(--color-cyan)]">NATIONAL</span>
              <span>
                {Math.min(...data.forecasts.map((f) => f.minTemp))}°–
                {Math.max(...data.forecasts.map((f) => f.maxTemp))}°C
              </span>
            </div>
            <span className="text-[var(--color-text-dim)] opacity-30">|</span>
          </>
        )}

        {/* Active warnings */}
        <div className="flex items-center gap-1.5 text-xs">
          {activeWarningCount > 0 ? (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--color-amber)" }}
              />
              <span className="text-[var(--color-amber)]">
                {activeWarningCount} WARNING{activeWarningCount > 1 ? "S" : ""}
              </span>
            </>
          ) : (
            <span className="text-[var(--color-text-dim)]">{warningsAvailable ? "NO WARNINGS" : "WARNINGS UNAVAILABLE"}</span>
          )}
        </div>

        <span className="text-[var(--color-text-dim)] opacity-30">|</span>

        {/* Flood alerts */}
        <div className="flex items-center gap-1.5 text-xs">
          {floodAlertCount > 0 ? (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--color-cyan)" }}
              />
              <span className="text-[var(--color-cyan)]">
                {floodAlertCount} FLOOD ALERT{floodAlertCount > 1 ? "S" : ""}
              </span>
            </>
          ) : (
            <span className="text-[var(--color-text-dim)]">{floodsAvailable ? "NO VERIFIED FLOOD ALERTS" : "FLOOD DATA UNAVAILABLE"}</span>
          )}
        </div>

        <span className="text-[var(--color-text-dim)] opacity-30">|</span>

        {/* Latest earthquake */}
        {data.earthquakes.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="tracking-[0.06em] text-[var(--color-text-dim)]">SEISMIC</span>
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
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="tracking-[0.06em] text-[var(--color-text-dim)]">AQI</span>
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
        <div className="ml-auto text-xs text-[var(--color-text-dim)]">
          {new Date(data.fetchedAt).toLocaleTimeString("en-MY", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          MYT
        </div>
      </div>

      {/* Mobile: bottom sheet with weather sidebar content (environment views bring their own) */}
      {!isEnvironment && (
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        peek={
          <PeekHeader
            eyebrow={selectedState ? "STATE WEATHER" : "NATIONAL WEATHER"}
            context="METMALAYSIA"
            title={displayName}
            flagSrc={getFlagSrc(selectedState)}
            aside={
              (activeWarningCount > 0 || floodAlertCount > 0) && (
                <>
                  {activeWarningCount > 0 && (
                    <div className="text-xs tracking-[0.06em] text-[var(--color-amber)]">
                      {activeWarningCount} WARNING{activeWarningCount > 1 ? "S" : ""}
                    </div>
                  )}
                  {floodAlertCount > 0 && (
                    <div className="text-xs tracking-[0.06em] text-[var(--color-cyan)]">
                      {floodAlertCount} FLOOD{floodAlertCount > 1 ? "S" : ""}
                    </div>
                  )}
                </>
              )
            }
          />
        }
      >
        <WeatherSidebar {...sidebarProps} variant="mobile" />
      </BottomSheet>
      )}
    </>
  );
}

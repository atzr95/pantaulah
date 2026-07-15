"use client";

import { Suspense, useState, useCallback, useEffect, useMemo, useRef, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import LoadingScreen from "@/components/ui/loading-screen";
import TopBar from "@/components/ui/top-bar";
import MetricToggles from "@/components/map/metric-toggles";
import TerritoryList, { MobileTerritoryChips } from "@/components/map/territory-list";
import TimeSlider from "@/components/ui/time-slider";
import StateBrief from "@/components/sidebar/state-brief";
import { StateBriefPeek, StateBriefContent } from "@/components/sidebar/state-brief";
import NewsTicker from "@/components/ticker/news-ticker";
import MobileRatesBar from "@/components/ticker/mobile-rates-bar";
import BottomSheet from "@/components/ui/bottom-sheet";
import type { MetricKey, CacheData } from "@/lib/data/types";
import { CATEGORY_METRICS } from "@/lib/data/choropleth";

const MalaysiaMap = dynamic(() => import("@/components/map/malaysia-map"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING MAP...
    </div>
  ),
});

const WeatherView = dynamic(() => import("@/components/weather/weather-view"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING WEATHER SYSTEMS...
    </div>
  ),
});

const MediaView = dynamic(() => import("@/components/media/media-view"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
      LOADING MEDIA FEEDS...
    </div>
  ),
});

/** Find the latest year where a metric has data in at least 10 states */
function findBestYear(cacheData: CacheData, metric: string): number {
  const years = cacheData.availableYears;
  const stateEntries = Object.values(cacheData.states);
  for (let i = years.length - 1; i >= 0; i--) {
    const y = years[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = stateEntries.filter((s: any) => s.years[y]?.[metric]).length;
    if (count >= 10) return y;
  }
  return years[years.length - 1];
}

// Valid category names for URL param validation
const VALID_CATEGORIES = new Set([
  ...Object.keys(CATEGORY_METRICS),
  "weather",
  "media",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeCacheData(mainMod: { default: unknown }, energyMod: { default: any } | null): CacheData {
  const cacheData = mainMod.default as unknown as CacheData;

  // Merge energy data into main cache if available
  if (energyMod) {
    const energyData = energyMod.default;
    cacheData.energy = energyData;

    // Inject energy metrics into state year data for choropleth
    if (energyData.electricityTotal) {
      for (const [state, years] of Object.entries(energyData.electricityTotal)) {
        if (cacheData.states[state]) {
          for (const [yearStr, metric] of Object.entries(years as Record<string, { value: number; year: number; change?: number }>)) {
            const year = Number(yearStr);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stateYears = (cacheData.states[state] as any).years;
            if (!stateYears[year]) stateYears[year] = {};
            stateYears[year].electricityConsumption = metric;
          }
        }
      }
    }

    // Inject water metrics (state-level)
    for (const [metricKey, dataKey] of [
      ["waterConsumption", "waterConsumption"],
      ["waterProduction", "waterProduction"],
      ["waterAccess", "waterAccess"],
    ] as const) {
      const waterData = energyData[dataKey];
      if (!waterData) continue;
      for (const [state, years] of Object.entries(waterData)) {
        if (!cacheData.states[state]) continue;
        for (const [yearStr, val] of Object.entries(years as Record<string, number | { total: number }>)) {
          const year = Number(yearStr);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stateYears = (cacheData.states[state] as any).years;
          if (!stateYears[year]) stateYears[year] = {};
          const value = typeof val === "object" ? val.total : val;
          stateYears[year][metricKey] = { value, year };
        }
      }
    }

    // Inject national totals into national.years
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const natYears = (cacheData.national as any).years;

    // National electricity: sum from nationalConsumptionBySector (already in GWh)
    if (energyData.nationalConsumptionBySector) {
      for (const [yearStr, sectors] of Object.entries(energyData.nationalConsumptionBySector as Record<string, Record<string, number>>)) {
        const year = Number(yearStr);
        if (!natYears[year]) natYears[year] = {};
        const total = Object.values(sectors).reduce((s: number, v: number) => s + v, 0);
        natYears[year].electricityConsumption = { value: Math.round(total * 100) / 100, year };
      }
    }

    // National water: sum all states per year
    for (const metricKey of ["waterConsumption", "waterProduction", "waterAccess"] as const) {
      const wd = energyData[metricKey];
      if (!wd) continue;
      const yearTotals: Record<number, { sum: number; count: number }> = {};
      for (const years of Object.values(wd) as Array<Record<string, number | { total: number }>>) {
        for (const [yearStr, val] of Object.entries(years)) {
          const year = Number(yearStr);
          const value = typeof val === "object" ? val.total : val;
          if (!yearTotals[year]) yearTotals[year] = { sum: 0, count: 0 };
          yearTotals[year].sum += value;
          yearTotals[year].count += 1;
        }
      }
      for (const [yearStr, { sum, count }] of Object.entries(yearTotals)) {
        const year = Number(yearStr);
        if (!natYears[year]) natYears[year] = {};
        // For waterAccess use average %, for others use sum
        const value = metricKey === "waterAccess"
          ? Math.round((sum / count) * 10) / 10
          : Math.round(sum * 100) / 100;
        natYears[year][metricKey] = { value, year };
      }
    }
  }

  return cacheData;
}

// Module scope: the JSON chunks start downloading as soon as this chunk
// evaluates, in parallel with hydration, instead of after the first effect.
const cacheDataPromise: Promise<CacheData> = Promise.all([
  import("@/lib/data/cache/data.json"),
  import("@/lib/data/cache/energy-data.json").catch(() => null),
]).then(([mainMod, energyMod]) => mergeCacheData(mainMod, energyMod));
// Defer rejection handling to the consumer in Home; avoid unhandled-rejection noise.
cacheDataPromise.catch(() => {});

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Resolve initial state from URL search params
  const initialCategory = useMemo(() => {
    const param = searchParams.get("tab");
    return param && VALID_CATEGORIES.has(param) ? param : "economy";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initialMetric = useMemo(() => {
    const param = searchParams.get("metric");
    const cat = initialCategory === "weather" ? "economy" : initialCategory;
    const metrics = CATEGORY_METRICS[cat];
    if (param && metrics?.some((m) => m.key === param)) return param;
    return metrics?.[0]?.key ?? "population";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [booted, setBooted] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("pantaulah-booted") === "1";
    }
    return false;
  });
  const [data, setData] = useState<CacheData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>(initialMetric);
  const [selectedYear, setSelectedYear] = useState<number>(2023);
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
  const [transitZoomed, setTransitZoomed] = useState(false);
  const bedUtilFetched = useRef(false);
  const [, startTransition] = useTransition();

  // Sync state changes to URL search params
  const updateURL = useCallback(
    (category: string, metric?: string) => {
      const params = new URLSearchParams();
      params.set("tab", category);
      if (metric && category !== "weather") {
        params.set("metric", metric);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // When metric changes, sync to URL. The choropleth recompute is heavy, so
  // mark it as a transition to keep the toggle buttons responsive.
  const handleMetricChange = useCallback(
    (metric: MetricKey) => {
      startTransition(() => {
        setSelectedMetric(metric);
      });
      updateURL(selectedCategory, metric);
    },
    [updateURL, selectedCategory]
  );

  // When category changes, switch to first metric in that category
  const handleCategoryChange = useCallback((category: string) => {
    const metrics = CATEGORY_METRICS[category];
    const firstMetric = metrics?.[0]?.key;
    startTransition(() => {
      setSelectedCategory(category);
      if (firstMetric) setSelectedMetric(firstMetric);
    });
    if (firstMetric) {
      updateURL(category, firstMetric);
    } else {
      updateURL(category);
    }
  }, [updateURL]);

  // Fetch live bed/ICU utilization from KKMNow when health category is active
  useEffect(() => {
    if (selectedCategory !== "health" || !data || bedUtilFetched.current) return;
    bedUtilFetched.current = true;

    let cancelled = false;
    fetch("/api/health/bed-utilization")
      .then((r) => (r.ok ? r.json() : null))
      .then((bedUtil) => {
        if (!bedUtil || cancelled) return;
        // File the values under the year the source was actually published
        // (KKMNow updates irregularly), not the current year.
        const currentYear = bedUtil.asOf
          ? new Date(bedUtil.asOf).getFullYear()
          : new Date().getFullYear();
        setData((prev) => {
          if (!prev) return prev;
          // Deep-clone to avoid mutating current state
          const next = { ...prev, states: { ...prev.states }, national: { ...prev.national } };

          // Inject utilization into each state's current year
          for (const [topoName, entry] of Object.entries(
            bedUtil.states as Record<string, { bedUtil: number; icuUtil: number }>
          )) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const old = next.states[topoName] as any;
            if (!old) continue;
            const stateYears = { ...old.years };
            if (!stateYears[currentYear]) stateYears[currentYear] = {};
            else stateYears[currentYear] = { ...stateYears[currentYear] };
            stateYears[currentYear].bedUtilization = { value: entry.bedUtil, year: currentYear };
            stateYears[currentYear].icuUtilization = { value: entry.icuUtil, year: currentYear };
            next.states[topoName] = { ...old, years: stateYears };
          }
          // Inject national
          if (bedUtil.national) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldNat = next.national as any;
            const natYears = { ...oldNat.years };
            if (!natYears[currentYear]) natYears[currentYear] = {};
            else natYears[currentYear] = { ...natYears[currentYear] };
            natYears[currentYear].bedUtilization = { value: bedUtil.national.bedUtil, year: currentYear };
            natYears[currentYear].icuUtilization = { value: bedUtil.national.icuUtil, year: currentYear };
            next.national = { ...oldNat, years: natYears };
          }
          // Ensure current year is in availableYears
          if (!next.availableYears.includes(currentYear)) {
            next.availableYears = [...next.availableYears, currentYear].sort((a, b) => a - b);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCategory, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // When metric changes, clamp year to the metric's data range
  useEffect(() => {
    if (!data) return;
    const best = findBestYear(data, selectedMetric);
    // Only adjust if current year has no data for this metric
    const stateEntries = Object.values(data.states);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = stateEntries.filter((s: any) => s.years[selectedYear]?.[selectedMetric]).length;
    if (count < 10) setSelectedYear(best);
  }, [selectedMetric, data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    cacheDataPromise
      .then((cacheData) => {
        if (cancelled) return;
        setData(cacheData);
        setSelectedYear(findBestYear(cacheData, "population"));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBootComplete = useCallback(() => {
    setBooted(true);
    sessionStorage.setItem("pantaulah-booted", "1");
  }, []);

  if (!data) {
    return (
      <main className="h-dvh bg-[var(--color-bg)] flex items-center justify-center">
        {loadFailed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-[var(--color-amber)] text-xs tracking-wider">
              DATA SYNC FAILED
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-[var(--color-cyan)] text-xs tracking-[2px] border border-[rgba(0,212,255,0.3)] px-4 py-2 hover:bg-[rgba(0,212,255,0.08)] transition-colors"
            >
              RELOAD
            </button>
          </div>
        ) : (
          <div className="text-[var(--color-text-dim)] text-xs tracking-wider">
            AWAITING DATA SYNC...
          </div>
        )}
      </main>
    );
  }

  const fetchedDate = new Date(data.fetchedAt);
  const syncAgeDays = (Date.now() - fetchedDate.getTime()) / 86_400_000;
  // Same-day data shows the time; older data shows its date so users see
  // exactly how fresh the snapshot is.
  const lastSync =
    syncAgeDays < 1
      ? fetchedDate.toLocaleTimeString("en-MY", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }) + " MYT"
      : fetchedDate
          .toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
          .toUpperCase();

  return (
    <main className="h-dvh bg-[var(--color-bg)] scan-lines grid-bg flex flex-col overflow-hidden">
      {!booted && <LoadingScreen onComplete={handleBootComplete} />}

      <TopBar
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        lastSync={lastSync}
        syncStale={syncAgeDays > 2}
      />

      {selectedCategory === "weather" ? (
        <WeatherView />
      ) : selectedCategory === "media" ? (
        <MediaView />
      ) : (
        <>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 min-w-0 relative flex flex-col">
              {/* Mobile: horizontal metric toggles strip */}
              <div
                className="lg:hidden flex items-center gap-1.5 px-3 py-2 shrink-0"
                style={{
                  background: "rgba(13, 13, 20, 0.9)",
                  borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
                }}
              >
                <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-none">
                  <MetricToggles
                    selectedCategory={selectedCategory}
                    selectedMetric={selectedMetric}
                    onMetricChange={handleMetricChange}
                  />
                </div>
                <div
                  className="text-xs font-bold tracking-[2px] text-[var(--color-cyan)] shrink-0 pl-1"
                  style={{ textShadow: "0 0 10px rgba(0, 212, 255, 0.3)" }}
                >
                  {selectedYear}
                </div>
              </div>

              <MalaysiaMap
                data={data}
                selectedState={selectedState}
                selectedMetric={selectedMetric}
                selectedYear={selectedYear}
                selectedCategory={selectedCategory}
                onStateSelect={setSelectedState}
                onTransitZoomChange={setTransitZoomed}
                sheetSnap={sheetSnap}
                mobileSlider={
                  <>
                    <MobileTerritoryChips
                      selectedState={selectedState}
                      onStateSelect={setSelectedState}
                    />
                    {data.availableYears.length > 1 && selectedMetric !== "bedUtilization" && selectedMetric !== "icuUtilization" && (
                      <TimeSlider
                        availableYears={data.availableYears}
                        selectedYear={selectedYear}
                        selectedMetric={selectedMetric}
                        data={data}
                        onYearChange={setSelectedYear}
                        inline
                      />
                    )}
                  </>
                }
              />

              {/* Desktop: metric toggles overlay */}
              <div className="absolute top-4 right-4 z-10 hidden lg:flex flex-col items-end gap-1.5 max-w-[70%]">
                <MetricToggles
                  selectedCategory={selectedCategory}
                  selectedMetric={selectedMetric}
                  onMetricChange={handleMetricChange}
                />
                <div
                  className="text-sm font-bold tracking-[3px] text-[var(--color-cyan)] pr-1"
                  style={{ textShadow: "0 0 10px rgba(0, 212, 255, 0.3)" }}
                >
                  {selectedYear}
                </div>
              </div>

              <TerritoryList
                selectedState={selectedState}
                onStateSelect={setSelectedState}
              />

              {/* Desktop: absolute-positioned time slider */}
              <div className="hidden lg:block">
                {!transitZoomed && data.availableYears.length > 1 && selectedMetric !== "bedUtilization" && selectedMetric !== "icuUtilization" && (
                  <TimeSlider
                    availableYears={data.availableYears}
                    selectedYear={selectedYear}
                    selectedMetric={selectedMetric}
                    data={data}
                    onYearChange={setSelectedYear}
                  />
                )}
              </div>
            </div>

            {/* Desktop: sidebar */}
            <StateBrief
              data={data}
              selectedState={selectedState}
              selectedYear={selectedYear}
              selectedCategory={selectedCategory}
              selectedMetric={selectedMetric}
              onStateSelect={setSelectedState}
            />
          </div>

          {/* Desktop: news ticker */}
          <div className="hidden lg:block">
            <NewsTicker />
          </div>

          {/* Mobile: bottom sheet with rates bar + peek */}
          <BottomSheet
            snap={sheetSnap}
            onSnapChange={setSheetSnap}
            peek={
              <>
                <MobileRatesBar />
                <StateBriefPeek
                  data={data}
                  selectedState={selectedState}
                  selectedYear={selectedYear}
                  selectedCategory={selectedCategory}
                  selectedMetric={selectedMetric}
                />
              </>
            }
          >
            <StateBriefContent
              data={data}
              selectedState={selectedState}
              selectedYear={selectedYear}
              selectedCategory={selectedCategory}
              selectedMetric={selectedMetric}
              onStateSelect={setSelectedState}
            />
          </BottomSheet>
        </>
      )}
    </main>
  );
}

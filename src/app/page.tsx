"use client";

import { Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import LoadingScreen from "@/components/ui/loading-screen";
import TopBar from "@/components/ui/top-bar";
import MetricToggles from "@/components/map/metric-toggles";
import TerritoryList from "@/components/map/territory-list";
import TimeSlider from "@/components/ui/time-slider";
import StateBrief from "@/components/sidebar/state-brief";
import { StateBriefPeek, StateBriefContent } from "@/components/sidebar/state-brief";
import NewsTicker from "@/components/ticker/news-ticker";
import MobileRatesBar from "@/components/ticker/mobile-rates-bar";
import BottomSheet from "@/components/ui/bottom-sheet";
import WeatherView from "@/components/weather/weather-view";
import MediaView from "@/components/media/media-view";
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
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>(initialMetric);
  const [selectedYear, setSelectedYear] = useState<number>(2023);
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");

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

  // When metric changes, sync to URL
  const handleMetricChange = useCallback(
    (metric: MetricKey) => {
      setSelectedMetric(metric);
      updateURL(selectedCategory, metric);
    },
    [updateURL, selectedCategory]
  );

  // When category changes, switch to first metric in that category
  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    const metrics = CATEGORY_METRICS[category];
    const firstMetric = metrics?.[0]?.key;
    if (firstMetric) {
      setSelectedMetric(firstMetric);
      updateURL(category, firstMetric);
    } else {
      updateURL(category);
    }
  }, [updateURL]);

  // Fetch live bed/ICU utilization from KKMNow when health category is active
  useEffect(() => {
    if (selectedCategory !== "health" || !data) return;
    // Only fetch once — check if already injected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyState = Object.values(data.states)[0] as any;
    const currentYear = new Date().getFullYear();
    if (anyState?.years[currentYear]?.bedUtilization) return;

    fetch("/api/health/bed-utilization")
      .then((r) => (r.ok ? r.json() : null))
      .then((bedUtil) => {
        if (!bedUtil) return;
        // Inject utilization into each state's current year
        for (const [topoName, entry] of Object.entries(
          bedUtil.states as Record<string, { bedUtil: number; icuUtil: number }>
        )) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stateYears = (data.states[topoName] as any)?.years;
          if (!stateYears) continue;
          if (!stateYears[currentYear]) stateYears[currentYear] = {};
          stateYears[currentYear].bedUtilization = {
            value: entry.bedUtil,
            year: currentYear,
          };
          stateYears[currentYear].icuUtilization = {
            value: entry.icuUtil,
            year: currentYear,
          };
        }
        // Inject national
        if (bedUtil.national) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const natYears = (data.national as any).years;
          if (!natYears[currentYear]) natYears[currentYear] = {};
          natYears[currentYear].bedUtilization = {
            value: bedUtil.national.bedUtil,
            year: currentYear,
          };
          natYears[currentYear].icuUtilization = {
            value: bedUtil.national.icuUtil,
            year: currentYear,
          };
        }
        // Ensure current year is in availableYears
        if (!data.availableYears.includes(currentYear)) {
          data.availableYears.push(currentYear);
          data.availableYears.sort((a, b) => a - b);
        }
        // Trigger re-render
        setData({ ...data });
      })
      .catch(() => {});
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
    Promise.all([
      import("@/lib/data/cache/data.json"),
      import("@/lib/data/cache/energy-data.json").catch(() => null),
    ]).then(([mainMod, energyMod]) => {
      const cacheData = mainMod.default as unknown as CacheData;

      // Merge energy data into main cache if available
      if (energyMod) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const energyData = energyMod.default as any;
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

      setData(cacheData);
      setSelectedYear(findBestYear(cacheData, "population"));
    });
  }, []);

  const handleBootComplete = useCallback(() => {
    setBooted(true);
    sessionStorage.setItem("pantaulah-booted", "1");
  }, []);

  if (!data) {
    return (
      <main className="h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-[var(--color-text-dim)] text-xs tracking-wider">
          AWAITING DATA SYNC...
        </div>
      </main>
    );
  }

  const lastSync = new Date(data.fetchedAt).toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <main className="h-screen bg-[var(--color-bg)] scan-lines grid-bg flex flex-col overflow-hidden">
      {!booted && <LoadingScreen onComplete={handleBootComplete} />}

      <TopBar
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        lastSync={lastSync + " MYT"}
      />

      {selectedCategory === "weather" ? (
        <WeatherView />
      ) : selectedCategory === "media" ? (
        <MediaView />
      ) : (
        <>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 relative flex flex-col">
              {/* Mobile: horizontal metric toggles strip */}
              <div
                className="lg:hidden flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0"
                style={{
                  background: "rgba(13, 13, 20, 0.9)",
                  borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
                }}
              >
                <MetricToggles
                  selectedCategory={selectedCategory}
                  selectedMetric={selectedMetric}
                  onMetricChange={handleMetricChange}
                />
                <div
                  className="text-xs font-bold tracking-[2px] text-[var(--color-cyan)] shrink-0 flex items-center pl-1"
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
                sheetSnap={sheetSnap}
                mobileSlider={
                  data.availableYears.length > 1 ? (
                    <TimeSlider
                      availableYears={data.availableYears}
                      selectedYear={selectedYear}
                      selectedMetric={selectedMetric}
                      data={data}
                      onYearChange={setSelectedYear}
                      inline
                    />
                  ) : undefined
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
                {data.availableYears.length > 1 && (
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
            />
          </BottomSheet>
        </>
      )}
    </main>
  );
}

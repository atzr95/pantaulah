"use client";

import { useMemo } from "react";
import MetricCard from "./metric-card";
import GdpSectors from "./gdp-sectors";
import CrimeBreakdown from "./crime-breakdown";
import BloodGroups from "./blood-groups";
import ElectricitySectors from "./electricity-sectors";
import EnrolmentBreakdown from "./enrolment-breakdown";
import RidershipCard from "./ridership-card";
import CCTVViewer from "./cctv-viewer";
import type { CacheData, SparklinePoint } from "@/lib/data/types";
import {
  formatPopulationCompact,
  formatChange,
  formatMetricValue,
} from "@/lib/utils/format";
import { MALAYSIA_STATES } from "@/lib/data/states";
import { CATEGORY_METRICS, NATIONAL_ECONOMY_INDICATORS } from "@/lib/data/choropleth";

/** Map topoName → flag SVG filename in /public/flags/ */
const STATE_FLAG_FILE: Record<string, string> = {
  "Johor": "johor.svg",
  "Kedah": "kedah.svg",
  "Kelantan": "kelantan.svg",
  "Melaka": "melaka.svg",
  "Negeri Sembilan": "negeri_sembilan.svg",
  "Pahang": "pahang.svg",
  "Perak": "perak.svg",
  "Perlis": "perlis.svg",
  "Penang": "pulau_pinang.svg",
  "Sabah": "sabah.svg",
  "Sarawak": "sarawak.svg",
  "Selangor": "selangor.svg",
  "Terengganu": "terengganu.svg",
  "Kuala Lumpur": "kuala_lumpur.svg",
  "Putrajaya": "putrajaya.svg",
  "Labuan": "labuan.svg",
};

function getFlagSrc(topoName: string | null): string {
  if (!topoName) return "/flags/malaysia.svg";
  return `/flags/${STATE_FLAG_FILE[topoName] ?? "malaysia.svg"}`;
}

interface StateBriefProps {
  data: CacheData;
  selectedState: string | null;
  selectedYear: number;
  selectedCategory: string;
  selectedMetric: string;
}

interface StateYearEntry {
  value: number;
  year: number;
  change?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMetric(years: any, metric: string, year: number): StateYearEntry | undefined {
  return years?.[year]?.[metric] as StateYearEntry | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSparkline(years: any, metric: string, currentYear: number): SparklinePoint[] {
  const points: SparklinePoint[] = [];
  for (let y = currentYear - 7; y <= currentYear; y++) {
    const m = years?.[y]?.[metric] as StateYearEntry | undefined;
    if (m) points.push({ year: y, value: m.value });
  }
  return points;
}

function getChangeSuffix(key: string): string {
  if (key === "unemployment") return "QoQ";
  if (key === "cpi") return "MoM";
  return "YoY";
}

/** Metrics that are already rates/percentages — show change in pp, not % */
const PP_METRICS = new Set(["unemployment", "inflation"]);

function getChangeUnit(key: string): "%" | "pp" {
  return PP_METRICS.has(key) ? "pp" : "%";
}

/** Shared hook for StateBrief data */
function useStateBriefData(data: CacheData, selectedState: string | null, selectedYear: number) {
  const stateInfo = useMemo(
    () =>
      selectedState
        ? MALAYSIA_STATES.find((s) => s.topoName === selectedState)
        : null,
    [selectedState]
  );

  const stateData = useMemo(() => {
    if (!selectedState) return data.national;
    return data.states[selectedState] as typeof data.national | undefined;
  }, [data, selectedState]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const years = useMemo(() => (stateData as any)?.years, [stateData]);

  const populationMetric = useMemo(() => getMetric(years, "population", selectedYear), [years, selectedYear]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nationalYears = useMemo(() => (data.national as any)?.years, [data]);

  const displayName = selectedState ? selectedState.toUpperCase() : "MALAYSIA";
  const subtitle = selectedState
    ? stateInfo
      ? `Capital: ${stateInfo.capital}${stateInfo.isFederalTerritory ? " | Federal Territory" : ""}`
      : ""
    : "Capital: Kuala Lumpur";
  const flagSrc = getFlagSrc(selectedState);

  return { stateInfo, years, populationMetric, nationalYears, displayName, subtitle, flagSrc };
}

/** Mobile peek header — shows flag + name + active metric */
export function StateBriefPeek({
  data,
  selectedState,
  selectedYear,
  selectedCategory,
  selectedMetric,
}: StateBriefProps) {
  const { years, displayName, flagSrc } = useStateBriefData(data, selectedState, selectedYear);
  const categoryMetrics = CATEGORY_METRICS[selectedCategory] ?? [];
  const activeConfig = categoryMetrics.find((m) => m.key === selectedMetric) ?? categoryMetrics[0];
  const activeMetric = activeConfig ? getMetric(years, activeConfig.key, selectedYear) : undefined;

  return (
    <div className="flex items-center gap-3">
      <img
        src={flagSrc}
        alt={`${displayName} flag`}
        className="w-7 h-4.5 object-cover rounded-sm shrink-0"
        style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--color-text-bright)] tracking-wider truncate">
          {displayName}
        </div>
        <div className="text-[10px] tracking-[1.5px] text-[var(--color-text-dim)]">
          {selectedState ? "STATE BRIEF" : "NATIONAL"} / {selectedCategory.toUpperCase()}
        </div>
      </div>
      {activeConfig && (
        <div className="text-right shrink-0">
          <div className="text-[10px] tracking-[1.5px] text-[var(--color-text-dim)]">
            {activeConfig.label}
          </div>
          <div className="text-base font-bold text-[var(--color-text-bright)]">
            {formatMetricValue(activeConfig.key, activeMetric?.value)}
          </div>
          {activeMetric?.change != null && (
            <div
              className="text-[10px]"
              style={{
                color:
                  activeMetric.change >= 0
                    ? activeConfig.colorHue === "amber"
                      ? "var(--color-red)"
                      : "var(--color-green)"
                    : activeConfig.colorHue === "amber"
                      ? "var(--color-green)"
                      : "var(--color-red)",
              }}
            >
              {formatChange(activeMetric.change, getChangeSuffix(activeConfig.key), getChangeUnit(activeConfig.key))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Full StateBrief content (used in both desktop sidebar and mobile sheet body) */
export function StateBriefContent({
  data,
  selectedState,
  selectedYear,
  selectedCategory,
  selectedMetric,
}: StateBriefProps) {
  const { years, populationMetric, nationalYears } = useStateBriefData(data, selectedState, selectedYear);
  const categoryMetrics = CATEGORY_METRICS[selectedCategory] ?? [];

  return (
    <>
      {/* Metrics Grid - dynamic based on category */}
      <div
        className="grid grid-cols-2 gap-px"
        style={{ background: "rgba(0, 212, 255, 0.05)", padding: 1 }}
      >
        {categoryMetrics.map((config) => {
          const m = getMetric(years, config.key, selectedYear);
          const spark = getSparkline(years, config.key, selectedYear);
          return (
            <MetricCard
              key={config.key}
              label={config.label}
              value={formatMetricValue(config.key, m?.value)}
              change={m?.change != null ? formatChange(m.change, getChangeSuffix(config.key), getChangeUnit(config.key)) : undefined}
              isAlert={config.colorHue === "amber" && (m?.change ?? 0) > 5}
              sparklineData={spark}
              sparklineColor={config.colorHue === "amber" ? "rgba(255, 149, 0, 0.4)" : "rgba(0, 212, 255, 0.4)"}
              description={config.description}
            />
          );
        })}

        {/* Always show population as context row (skip if economy category already includes it) */}
        {!categoryMetrics.some((m) => m.key === "population") && (
          <div className="col-span-2 bg-[var(--color-bg)] p-3.5">
            <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-1.5">
              POPULATION
            </div>
            <div className="text-xl font-bold text-[var(--color-text-bright)]">
              {formatPopulationCompact(populationMetric?.value)}
            </div>
            {populationMetric?.change != null && (
              <div
                className="text-[10px] mt-0.5"
                style={{
                  color: populationMetric.change >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                {formatChange(populationMetric.change, "YoY")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* GDP Sector Breakdown (shown when GDP is selected) */}
      {selectedMetric === "gdp" && (
        <div className="border-t border-[var(--color-border)]">
          <GdpSectors
            sectors={
              selectedState
                ? data.gdpSectors?.[selectedState]?.[selectedYear]
                : (() => {
                    const national: Record<string, number> = {};
                    if (data.gdpSectors) {
                      for (const stateData of Object.values(data.gdpSectors)) {
                        const yearData = stateData[selectedYear];
                        if (yearData) {
                          for (const [k, v] of Object.entries(yearData)) {
                            national[k] = (national[k] || 0) + (v as number);
                          }
                        }
                      }
                    }
                    return Object.keys(national).length > 0 ? national : undefined;
                  })()
            }
          />
        </div>
      )}

      {/* Crime Breakdown (shown when crime index is selected) */}
      {selectedMetric === "crime" && (
        <div className="border-t border-[var(--color-border)]">
          <CrimeBreakdown
            breakdown={
              selectedState
                ? data.crimeBreakdown?.[selectedState]?.[selectedYear]
                : (() => {
                    const national = { assault: 0, property: 0 };
                    if (data.crimeBreakdown) {
                      for (const stateData of Object.values(data.crimeBreakdown)) {
                        const yearData = stateData[selectedYear];
                        if (yearData) {
                          national.assault += yearData.assault;
                          national.property += yearData.property;
                        }
                      }
                    }
                    return national.assault + national.property > 0 ? national : undefined;
                  })()
            }
          />
        </div>
      )}

      {/* Blood Group Breakdown (shown when blood donations is selected) */}
      {selectedMetric === "bloodDonations" && (
        <div className="border-t border-[var(--color-border)]">
          <BloodGroups
            groups={
              selectedState
                ? data.bloodGroups?.[selectedState]?.[selectedYear]
                : (() => {
                    const national = { a: 0, b: 0, ab: 0, o: 0 };
                    if (data.bloodGroups) {
                      for (const stateData of Object.values(data.bloodGroups)) {
                        const yearData = stateData[selectedYear];
                        if (yearData) {
                          national.a += yearData.a;
                          national.b += yearData.b;
                          national.ab += yearData.ab;
                          national.o += yearData.o;
                        }
                      }
                    }
                    return national.a + national.b + national.ab + national.o > 0 ? national : undefined;
                  })()
            }
          />
        </div>
      )}

      {/* Enrolment Breakdown (shown when enrolment is selected) */}
      {selectedMetric === "enrolment" && (
        <div className="border-t border-[var(--color-border)]">
          <EnrolmentBreakdown
            breakdown={
              selectedState
                ? data.enrolmentBreakdown?.[selectedState]?.[selectedYear]
                : (() => {
                    const national = { primary: 0, secondary: 0 };
                    if (data.enrolmentBreakdown) {
                      for (const stateData of Object.values(data.enrolmentBreakdown)) {
                        const yearData = stateData[selectedYear];
                        if (yearData) {
                          national.primary += yearData.primary;
                          national.secondary += yearData.secondary;
                        }
                      }
                    }
                    return national.primary + national.secondary > 0 ? national : undefined;
                  })()
            }
          />
        </div>
      )}

      {/* Electricity Sector Breakdown (shown when electricity consumption is selected) */}
      {selectedMetric === "electricityConsumption" && (
        <div className="border-t border-[var(--color-border)]">
          <ElectricitySectors
            sectors={
              selectedState
                ? data.energy?.electricityConsumption?.[selectedState]?.[selectedYear]
                : undefined
            }
          />
        </div>
      )}

      {/* National Economy Indicators (shown for economy category) */}
      {selectedCategory === "economy" && (
        <div className="border-t border-[var(--color-border)]">
          <div className="px-4 py-2.5">
            <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
              NATIONAL INDICATORS
            </div>
          </div>
          <div
            className="grid grid-cols-2 gap-px"
            style={{ background: "rgba(0, 212, 255, 0.05)", padding: 1 }}
          >
            {NATIONAL_ECONOMY_INDICATORS.map((ind) => {
              const m = getMetric(nationalYears, ind.key, selectedYear);
              const spark = getSparkline(nationalYears, ind.key, selectedYear);
              return (
                <MetricCard
                  key={ind.key}
                  label={ind.label}
                  value={formatMetricValue(ind.key, m?.value)}
                  change={m?.change != null ? formatChange(m.change, ind.changeSuffix, getChangeUnit(ind.key)) : undefined}
                  isAlert={ind.colorHue === "amber" && (m?.change ?? 0) > 5}
                  sparklineData={spark}
                  sparklineColor={ind.colorHue === "amber" ? "rgba(255, 149, 0, 0.4)" : "rgba(0, 212, 255, 0.4)"}
                  description={ind.description}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Transport national indicators & CCTV */}
      {selectedCategory === "transport" && (
        <>
          <RidershipCard data={data} selectedYear={selectedYear} />
          <CCTVViewer />
        </>
      )}
    </>
  );
}

export default function StateBrief({
  data,
  selectedState,
  selectedYear,
  selectedCategory,
  selectedMetric,
}: StateBriefProps) {
  const { displayName, subtitle, flagSrc } = useStateBriefData(data, selectedState, selectedYear);
  const categoryLabel = selectedCategory.toUpperCase();

  return (
    <div
      className="w-[380px] hidden lg:flex flex-col overflow-y-auto shrink-0"
      style={{
        background: "linear-gradient(180deg, #0d0d14 0%, #0a0a0f 100%)",
        borderLeft: "1px solid rgba(0, 212, 255, 0.1)",
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <div className="text-[12px] tracking-[3px] text-[var(--color-cyan)] mb-1">
          {selectedState ? "STATE INTELLIGENCE BRIEF" : "NATIONAL OVERVIEW"}
          <span className="text-[var(--color-text-dim)] ml-2">/ {categoryLabel}</span>
        </div>
        <div className="text-[22px] font-bold text-[var(--color-text-bright)] tracking-wider flex items-center gap-3">
          <img
            src={flagSrc}
            alt={`${displayName} flag`}
            className="w-8 h-5 object-cover rounded-sm"
            style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
          />
          {displayName}
        </div>
        {subtitle && (
          <div className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      <StateBriefContent
        data={data}
        selectedState={selectedState}
        selectedYear={selectedYear}
        selectedCategory={selectedCategory}
        selectedMetric={selectedMetric}
      />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import MetricCard from "./metric-card";
import GdpSectors from "./gdp-sectors";
import CrimeBreakdown from "./crime-breakdown";
import BloodGroups from "./blood-groups";
import ElectricitySectors from "./electricity-sectors";
import EnrolmentBreakdown from "./enrolment-breakdown";
import GenerationByFuel from "./generation-by-fuel";
import RidershipCard from "./ridership-card";
import StateRanking from "./state-ranking";
import CCTVViewer from "./cctv-viewer";
import type { CacheData, SparklinePoint } from "@/lib/data/types";
import {
  formatPopulationCompact,
  formatChange,
  formatMetricValue,
  formatVintage,
  resolveLatestYear,
} from "@/lib/utils/format";
import { MALAYSIA_STATES } from "@/lib/data/states";
import { CATEGORY_METRICS, NATIONAL_ECONOMY_INDICATORS, getMetricValues } from "@/lib/data/choropleth";

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
  onStateSelect?: (topoName: string | null) => void;
}

interface StateYearEntry {
  value: number;
  year: number;
  change?: number;
}

/** Resolve a metric at the latest available year ≤ selected year (else its overall latest) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMetricResolved(years: any, metric: string, year: number): { value: StateYearEntry; year: number } | undefined {
  if (!years) return undefined;
  const byYear: Record<number, StateYearEntry> = {};
  for (const key of Object.keys(years)) {
    const entry = years[key]?.[metric] as StateYearEntry | undefined;
    if (entry != null) byYear[Number(key)] = entry;
  }
  return resolveLatestYear(byYear, year);
}

/** Resolve a per-state-per-year breakdown at the best vintage, aggregating across states for the national view */
function resolveBreakdown<T, R>(
  byState: Record<string, Record<number, T>> | undefined,
  state: string | null,
  year: number,
  aggregate: (entries: T[]) => R | undefined
): { value: R; year: number } | undefined {
  if (!byState) return undefined;
  if (state) {
    const resolved = resolveLatestYear(byState[state], year);
    if (!resolved) return undefined;
    const agg = aggregate([resolved.value]);
    return agg != null ? { value: agg, year: resolved.year } : undefined;
  }
  const yearsSeen: Record<number, true> = {};
  for (const stateYears of Object.values(byState)) {
    for (const key of Object.keys(stateYears)) yearsSeen[Number(key)] = true;
  }
  const resolved = resolveLatestYear(yearsSeen, year);
  if (!resolved) return undefined;
  const entries: T[] = [];
  for (const stateYears of Object.values(byState)) {
    const entry = stateYears[resolved.year];
    if (entry != null) entries.push(entry);
  }
  const agg = aggregate(entries);
  return agg != null ? { value: agg, year: resolved.year } : undefined;
}

/** Rank of a state among all states for a metric at a year → "#3/16" */
function getStateRank(data: CacheData, metric: string, year: number, state: string): string | undefined {
  const values = getMetricValues(data, metric, year);
  const mine = values[state];
  if (mine == null) return undefined;
  const sorted = Object.values(values)
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a);
  if (sorted.length < 2) return undefined;
  return `#${sorted.indexOf(mine) + 1}/${sorted.length}`;
}

/** Dim vintage tag overlaid on a breakdown panel header */
function PanelVintage({ year }: { year: number }) {
  return (
    <div className="absolute top-3.5 right-3.5 text-[10px] tracking-[1px] text-[var(--color-text-dim)]">
      ({year})
    </div>
  );
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
const PP_METRICS = new Set(["unemployment", "inflation", "epfDividend"]);

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

  const populationResolved = useMemo(() => getMetricResolved(years, "population", selectedYear), [years, selectedYear]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nationalYears = useMemo(() => (data.national as any)?.years, [data]);

  const displayName = selectedState ? selectedState.toUpperCase() : "MALAYSIA";
  const subtitle = selectedState
    ? stateInfo
      ? `Capital: ${stateInfo.capital}${stateInfo.isFederalTerritory ? " | Federal Territory" : ""}`
      : ""
    : "Capital: Kuala Lumpur";
  const flagSrc = getFlagSrc(selectedState);

  return { stateInfo, years, populationResolved, nationalYears, displayName, subtitle, flagSrc };
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
  const activeResolved = activeConfig ? getMetricResolved(years, activeConfig.key, selectedYear) : undefined;
  const activeMetric = activeResolved?.value;

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
            {activeResolved && activeResolved.year !== selectedYear && (
              <span className="ml-1 text-[9px] font-normal tracking-[1px] text-[var(--color-text-dim)] align-middle">
                {formatVintage(activeResolved.year)}
              </span>
            )}
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
              <span aria-hidden="true">{activeMetric.change >= 0 ? "▲" : "▼"}</span>{" "}
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
  onStateSelect,
}: StateBriefProps) {
  const { years, populationResolved, nationalYears } = useStateBriefData(data, selectedState, selectedYear);
  const categoryMetrics = CATEGORY_METRICS[selectedCategory] ?? [];
  const activeConfig = categoryMetrics.find((m) => m.key === selectedMetric);

  const gdpPanel = useMemo(
    () =>
      selectedMetric === "gdp"
        ? resolveBreakdown(data.gdpSectors, selectedState, selectedYear, (entries) => {
            const sums: Record<string, number> = {};
            for (const entry of entries) {
              for (const [k, v] of Object.entries(entry)) {
                if (typeof v === "number") sums[k] = (sums[k] || 0) + v;
              }
            }
            return Object.keys(sums).length > 0 ? sums : undefined;
          })
        : undefined,
    [data.gdpSectors, selectedMetric, selectedState, selectedYear]
  );

  const crimePanel = useMemo(
    () =>
      selectedMetric === "crime"
        ? resolveBreakdown(data.crimeBreakdown, selectedState, selectedYear, (entries) => {
            const sums = { assault: 0, property: 0 };
            for (const entry of entries) {
              sums.assault += entry.assault;
              sums.property += entry.property;
            }
            return sums.assault + sums.property > 0 ? sums : undefined;
          })
        : undefined,
    [data.crimeBreakdown, selectedMetric, selectedState, selectedYear]
  );

  const bloodPanel = useMemo(
    () =>
      selectedMetric === "bloodDonations"
        ? resolveBreakdown(data.bloodGroups, selectedState, selectedYear, (entries) => {
            const sums = { a: 0, b: 0, ab: 0, o: 0 };
            for (const entry of entries) {
              sums.a += entry.a;
              sums.b += entry.b;
              sums.ab += entry.ab;
              sums.o += entry.o;
            }
            return sums.a + sums.b + sums.ab + sums.o > 0 ? sums : undefined;
          })
        : undefined,
    [data.bloodGroups, selectedMetric, selectedState, selectedYear]
  );

  const enrolmentPanel = useMemo(
    () =>
      selectedMetric === "enrolment"
        ? resolveBreakdown(data.enrolmentBreakdown, selectedState, selectedYear, (entries) => {
            const sums = { primary: 0, secondary: 0 };
            for (const entry of entries) {
              sums.primary += entry.primary;
              sums.secondary += entry.secondary;
            }
            return sums.primary + sums.secondary > 0 ? sums : undefined;
          })
        : undefined,
    [data.enrolmentBreakdown, selectedMetric, selectedState, selectedYear]
  );

  const electricityPanel = useMemo(() => {
    if (selectedMetric !== "electricityConsumption") return undefined;
    if (selectedState) {
      return resolveLatestYear(data.energy?.electricityConsumption?.[selectedState], selectedYear);
    }
    const resolved = resolveLatestYear(data.energy?.nationalConsumptionBySector, selectedYear);
    if (!resolved) return undefined;
    const sectors = resolved.value;
    const total = Object.values(sectors).reduce((sum, v) => sum + v, 0);
    if (total <= 0) return undefined;
    return {
      year: resolved.year,
      value: {
        domestic: sectors["Residential"] ?? 0,
        commercial: sectors["Commercial"] ?? 0,
        industrial: sectors["Industrial"] ?? 0,
        mining: 0,
        publicLighting: 0,
        agriculture: sectors["Agriculture"] ?? 0,
        transport: sectors["Transport"] ?? 0,
        total,
      },
    };
  }, [data.energy, selectedMetric, selectedState, selectedYear]);

  const generationPanel = useMemo(() => {
    if (selectedState || selectedCategory !== "energy") return undefined;
    return resolveLatestYear(data.energy?.generationByFuel, selectedYear);
  }, [data.energy, selectedCategory, selectedState, selectedYear]);

  const capacityPanel = useMemo(() => {
    if (selectedState || selectedCategory !== "energy") return undefined;
    const byRegion = data.energy?.capacityByRegion;
    if (!byRegion) return undefined;
    const yearsSeen: Record<number, true> = {};
    for (const regionYears of Object.values(byRegion)) {
      for (const key of Object.keys(regionYears)) yearsSeen[Number(key)] = true;
    }
    const resolved = resolveLatestYear(yearsSeen, selectedYear);
    if (!resolved) return undefined;
    const rows = Object.entries(byRegion)
      .map(([region, regionYears]) => ({ region, mw: regionYears[resolved.year] }))
      .filter((row) => row.mw != null)
      .sort((a, b) => b.mw - a.mw);
    return rows.length > 0 ? { value: rows, year: resolved.year } : undefined;
  }, [data.energy, selectedCategory, selectedState, selectedYear]);

  return (
    <>
      {/* Metrics Grid - dynamic based on category */}
      <div
        className="grid grid-cols-2 gap-px"
        style={{ background: "rgba(0, 212, 255, 0.05)", padding: 1 }}
      >
        {categoryMetrics.map((config) => {
          const resolved = getMetricResolved(years, config.key, selectedYear);
          const m = resolved?.value;
          const spark = getSparkline(years, config.key, resolved?.year ?? selectedYear);
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
              vintage={resolved ? formatVintage(resolved.year) : undefined}
              rank={selectedState && resolved ? getStateRank(data, config.key, resolved.year, selectedState) : undefined}
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
              {formatPopulationCompact(populationResolved?.value.value)}
              {populationResolved && populationResolved.year !== selectedYear && (
                <span className="ml-1.5 text-[10px] font-normal tracking-[1px] text-[var(--color-text-dim)] align-middle">
                  {formatVintage(populationResolved.year)}
                </span>
              )}
            </div>
            {populationResolved?.value.change != null && (
              <div
                className="text-[10px] mt-0.5"
                style={{
                  color: populationResolved.value.change >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                <span aria-hidden="true">{populationResolved.value.change >= 0 ? "▲" : "▼"}</span>{" "}
                {formatChange(populationResolved.value.change, "YoY")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* GDP Sector Breakdown (shown when GDP is selected) */}
      {selectedMetric === "gdp" && (
        <div className="border-t border-[var(--color-border)]">
          <GdpSectors
            sectors={gdpPanel?.value}
            vintageYear={gdpPanel && gdpPanel.year !== selectedYear ? gdpPanel.year : undefined}
          />
        </div>
      )}

      {/* Crime Breakdown (shown when crime index is selected) */}
      {selectedMetric === "crime" && (
        <div className="border-t border-[var(--color-border)] relative">
          {crimePanel && crimePanel.year !== selectedYear && <PanelVintage year={crimePanel.year} />}
          <CrimeBreakdown breakdown={crimePanel?.value} />
        </div>
      )}

      {/* Blood Group Breakdown (shown when blood donations is selected) */}
      {selectedMetric === "bloodDonations" && (
        <div className="border-t border-[var(--color-border)] relative">
          {bloodPanel && bloodPanel.year !== selectedYear && <PanelVintage year={bloodPanel.year} />}
          <BloodGroups groups={bloodPanel?.value} />
        </div>
      )}

      {/* Enrolment Breakdown (shown when enrolment is selected) */}
      {selectedMetric === "enrolment" && (
        <div className="border-t border-[var(--color-border)] relative">
          {enrolmentPanel && enrolmentPanel.year !== selectedYear && <PanelVintage year={enrolmentPanel.year} />}
          <EnrolmentBreakdown breakdown={enrolmentPanel?.value} />
        </div>
      )}

      {/* Electricity Sector Breakdown (shown when electricity consumption is selected) */}
      {selectedMetric === "electricityConsumption" && (
        <div className="border-t border-[var(--color-border)]">
          {!selectedState && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] leading-relaxed text-[var(--color-text-dim)] italic">
                National electricity figures include all of Malaysia. State-level data covers 11
                Peninsular states only — summing states will not match the national figure.
              </p>
            </div>
          )}
          <ElectricitySectors
            sectors={electricityPanel?.value}
            vintageYear={electricityPanel && electricityPanel.year !== selectedYear ? electricityPanel.year : undefined}
          />
        </div>
      )}

      {/* National generation by fuel + installed capacity (energy category, national view) */}
      {generationPanel && (
        <div className="border-t border-[var(--color-border)]">
          <GenerationByFuel
            fuels={generationPanel.value}
            vintageYear={generationPanel.year !== selectedYear ? generationPanel.year : undefined}
            capacity={capacityPanel?.value}
            capacityVintageYear={capacityPanel && capacityPanel.year !== selectedYear ? capacityPanel.year : undefined}
          />
        </div>
      )}

      {/* All states ranked by the active metric */}
      {activeConfig && (
        <StateRanking
          data={data}
          config={activeConfig}
          selectedYear={selectedYear}
          selectedState={selectedState}
          onStateSelect={onStateSelect}
        />
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
              const resolved = getMetricResolved(nationalYears, ind.key, selectedYear);
              const m = resolved?.value;
              const spark = getSparkline(nationalYears, ind.key, resolved?.year ?? selectedYear);
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
                  vintage={resolved ? formatVintage(resolved.year) : undefined}
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
  onStateSelect,
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
        onStateSelect={onStateSelect}
      />
    </div>
  );
}

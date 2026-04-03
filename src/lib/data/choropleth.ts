/**
 * Choropleth coloring logic.
 * Computes tercile-based color buckets for map state fills.
 *
 *  Metric type    Low color         High color
 *  ─────────────────────────────────────────────
 *  Neutral        dim cyan          bright cyan
 *  Concern        dim amber         bright amber
 */

import type { CacheData } from "./types";

export type MetricKey = string;

export interface ChoroplethConfig {
  key: MetricKey;
  label: string;
  colorHue: "cyan" | "amber";
  unit: string;
  description: string;
}

export const CATEGORY_METRICS: Record<string, ChoroplethConfig[]> = {
  economy: [
    { key: "gdp", label: "GDP", colorHue: "cyan", unit: "RM M", description: "Gross Domestic Product at constant 2015 prices. Total economic output by state." },
    { key: "gdpPerCapita", label: "GDP PER CAPITA", colorHue: "cyan", unit: "RM", description: "GDP divided by population. Measures economic output per person — the best way to compare wealth across states of different sizes." },
    { key: "unemployment", label: "UNEMPLOYMENT", colorHue: "amber", unit: "%", description: "Percentage of the labour force that is unemployed and actively seeking work." },
    { key: "cpi", label: "CPI", colorHue: "amber", unit: "index", description: "Consumer Price Index (base 2010 = 100). Measures average change in prices paid by consumers." },
    { key: "population", label: "POPULATION", colorHue: "cyan", unit: "K", description: "Estimated resident population including citizens and non-citizens." },
    { key: "householdIncome", label: "HOUSEHOLD INCOME", colorHue: "cyan", unit: "RM", description: "Median monthly gross household income from all sources." },
  ],
  crime: [
    { key: "crime", label: "CRIME INDEX", colorHue: "amber", unit: "cases", description: "Total index crimes reported, including violent crimes (murder, robbery) and property crimes (burglary, theft)." },
    { key: "crimeRate", label: "CRIME RATE", colorHue: "amber", unit: "per 100K", description: "Crime index per 100,000 population. Normalizes for state size — the fairest way to compare safety across states." },
    { key: "drugAddicts", label: "DRUG ADDICTS", colorHue: "amber", unit: "persons", description: "Total detected drug addicts registered with AADK (National Anti-Drugs Agency) per year." },
    { key: "homicideRate", label: "HOMICIDE RATE", colorHue: "amber", unit: "per 100K", description: "Intentional homicide victims per 100,000 population. The most internationally comparable safety metric (SDG 16.1.1)." },
  ],
  health: [
    { key: "organPledges", label: "ORGAN PLEDGES", colorHue: "cyan", unit: "pledges", description: "Number of new organ donation pledges registered with the National Transplant Resource Centre." },
    { key: "healthScreenings", label: "PEKA B40 SCREENINGS", colorHue: "cyan", unit: "screenings", description: "Total health screenings conducted under the PeKa B40 programme for low-income households." },
    { key: "doctorsPerCapita", label: "DOCTORS / 10K", colorHue: "cyan", unit: "per 10K", description: "Number of doctors per 10,000 population. Measures how well-served a state's healthcare system is." },
    { key: "bedsPerCapita", label: "HOSPITAL BEDS / 10K", colorHue: "cyan", unit: "per 10K", description: "Number of hospital beds per 10,000 population. Indicates hospital capacity and healthcare infrastructure." },
    { key: "deathRate", label: "DEATH RATE", colorHue: "amber", unit: "per 1K", description: "Crude death rate per 1,000 population per year. Higher rates may indicate an aging population or health challenges." },
    { key: "birthRate", label: "BIRTH RATE", colorHue: "cyan", unit: "per 1K", description: "Crude birth rate per 1,000 population per year. Shows population growth dynamics by state." },
    { key: "bloodDonations", label: "BLOOD DONATIONS", colorHue: "cyan", unit: "donations", description: "Total blood donations collected per year. Covers all blood groups (A, B, AB, O)." },
    { key: "bedUtilization", label: "BED UTILIZATION", colorHue: "amber", unit: "%", description: "Non-ICU hospital bed occupancy rate (%). Updated daily from KKMNow. Higher values indicate greater strain on hospital capacity." },
    { key: "icuUtilization", label: "ICU UTILIZATION", colorHue: "amber", unit: "%", description: "ICU bed occupancy rate (%). Updated daily from KKMNow. Critical indicator of intensive care capacity pressure." },
  ],
  transport: [
    { key: "vehicleReg", label: "CAR REGISTRATIONS", colorHue: "cyan", unit: "cars", description: "New car registrations recorded by JPJ (Road Transport Department) per year." },
    { key: "motorcycleReg", label: "MOTORCYCLE REGISTRATIONS", colorHue: "cyan", unit: "motorcycles", description: "New motorcycle registrations recorded by JPJ per year. Malaysia has one of the highest motorcycle-per-capita rates globally." },
  ],
  education: [
    { key: "schools", label: "SCHOOLS", colorHue: "cyan", unit: "schools", description: "Total number of government and government-aided schools (primary and secondary)." },
    { key: "enrolment", label: "ENROLMENT", colorHue: "cyan", unit: "students", description: "Total student enrolment across all government and government-aided schools." },
    { key: "teachers", label: "TEACHERS", colorHue: "cyan", unit: "teachers", description: "Total teaching staff in government and government-aided schools." },
    { key: "studentTeacherRatio", label: "STUDENT-TEACHER", colorHue: "amber", unit: "ratio", description: "Number of students per teacher. Lower is generally better — indicates more individual attention per student." },
    { key: "completion", label: "COMPLETION RATE", colorHue: "cyan", unit: "%", description: "Percentage of students completing upper secondary education (SPM level). Values above 100% can occur when students transfer in from other states and complete their studies there." },
    { key: "literacy", label: "LITERACY RATE", colorHue: "cyan", unit: "%", description: "Percentage of population aged 15+ who are literate (SDG 4.6.1). Internationally comparable." },
  ],
  energy: [
    { key: "electricityConsumption", label: "ELECTRICITY", colorHue: "cyan", unit: "GWh", description: "Total electricity consumption by state (GWh). Peninsular states only — Sabah/Sarawak data from SESB/Sarawak Energy not available via API." },
    { key: "waterConsumption", label: "WATER USE", colorHue: "cyan", unit: "MLD", description: "Total water consumption in millions of litres per day (MLD), covering domestic and non-domestic usage. Source: SPAN." },
    { key: "waterProduction", label: "WATER SUPPLY", colorHue: "cyan", unit: "MLD", description: "Total water production in millions of litres per day (MLD). Source: SPAN." },
    { key: "waterAccess", label: "WATER ACCESS", colorHue: "cyan", unit: "%", description: "Percentage of households with access to treated piped water. Source: SPAN." },
  ],
};

// Flat list for backward compat
export const METRIC_CONFIGS: ChoroplethConfig[] = Object.values(CATEGORY_METRICS).flat();

/** National-only economy indicators (not per-state, shown in sidebar) */
export interface NationalIndicatorConfig {
  key: string;
  label: string;
  colorHue: "cyan" | "amber";
  changeSuffix: string;
  description: string;
}

export const NATIONAL_ECONOMY_INDICATORS: NationalIndicatorConfig[] = [
  { key: "exports", label: "EXPORTS", colorHue: "cyan", changeSuffix: "YoY", description: "Total value of goods exported from Malaysia." },
  { key: "imports", label: "IMPORTS", colorHue: "cyan", changeSuffix: "YoY", description: "Total value of goods imported into Malaysia." },
  { key: "tradeBalance", label: "TRADE BALANCE", colorHue: "cyan", changeSuffix: "YoY", description: "Exports minus imports. A positive value means Malaysia exports more than it imports." },
  { key: "inflation", label: "INFLATION", colorHue: "amber", changeSuffix: "YoY", description: "Year-on-year change in consumer prices. Measures how fast prices are rising." },
  { key: "ipi", label: "IPI", colorHue: "cyan", changeSuffix: "YoY", description: "Industrial Production Index. Measures output of manufacturing, mining, and electricity sectors." },
  { key: "fdi", label: "NET FDI", colorHue: "cyan", changeSuffix: "YoY", description: "Net Foreign Direct Investment. Capital flowing into Malaysia from foreign investors." },
  { key: "lei", label: "LEI", colorHue: "cyan", changeSuffix: "YoY", description: "Leading Economic Index. Predicts the direction of the economy over the next 3-6 months." },
  { key: "cei", label: "CEI", colorHue: "cyan", changeSuffix: "YoY", description: "Coincident Economic Index. Reflects current economic conditions in real time." },
];

export type ChoroplethBucket = "low" | "medium" | "high" | "none";

interface Terciles {
  t1: number;
  t2: number;
  min: number;
  max: number;
}

export function computeTerciles(values: number[]): Terciles | null {
  const sorted = [...values].filter((v) => v != null).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const t1 = sorted[Math.floor(sorted.length / 3)];
  const t2 = sorted[Math.floor((sorted.length * 2) / 3)];
  return { t1, t2, min: sorted[0], max: sorted[sorted.length - 1] };
}

export function getBucket(value: number | undefined, terciles: Terciles | null): ChoroplethBucket {
  if (value == null || !terciles) return "none";
  if (value <= terciles.t1) return "low";
  if (value <= terciles.t2) return "medium";
  return "high";
}

export function getBucketColor(bucket: ChoroplethBucket, hue: "cyan" | "amber"): string {
  if (bucket === "none") return "rgba(30, 40, 55, 0.6)";
  const colors = {
    cyan: {
      low: "rgba(0, 150, 200, 0.25)",
      medium: "rgba(0, 180, 230, 0.4)",
      high: "rgba(0, 212, 255, 0.55)",
    },
    amber: {
      low: "rgba(0, 150, 200, 0.25)",
      medium: "rgba(200, 130, 0, 0.4)",
      high: "rgba(255, 149, 0, 0.55)",
    },
  };
  return colors[hue][bucket];
}

export function getBucketStroke(bucket: ChoroplethBucket, hue: "cyan" | "amber"): string {
  if (bucket === "none") return "rgba(100, 140, 170, 0.3)";
  const strokes = {
    cyan: {
      low: "rgba(0, 212, 255, 0.4)",
      medium: "rgba(0, 212, 255, 0.6)",
      high: "rgba(0, 212, 255, 0.8)",
    },
    amber: {
      low: "rgba(0, 212, 255, 0.4)",
      medium: "rgba(255, 149, 0, 0.6)",
      high: "rgba(255, 149, 0, 0.8)",
    },
  };
  return strokes[hue][bucket];
}

/** Extract metric values for all states at a given year */
export function getMetricValues(
  data: CacheData,
  metric: MetricKey,
  year: number
): Record<string, number | undefined> {
  const result: Record<string, number | undefined> = {};
  for (const [topoName, stateData] of Object.entries(data.states)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yrs = (stateData as any).years;
    result[topoName] = yrs?.[year]?.[metric]?.value;
  }
  return result;
}

/**
 * Choropleth coloring logic.
 * Computes a rank-based continuous color ramp for map state fills.
 *
 *  Metric type    Low color         High color
 *  ─────────────────────────────────────────────
 *  Neutral        dim cyan          bright cyan
 *  Concern        dim cyan          bright amber (via warm grey)
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
    { key: "tfr", label: "FERTILITY (TFR)", colorHue: "cyan", unit: "births per woman", description: "Total Fertility Rate — average number of children a woman would bear over her lifetime. Below 2.1 means the population is not replacing itself." },
    { key: "bloodDonations", label: "BLOOD DONATIONS", colorHue: "cyan", unit: "donations", description: "Total blood donations collected per year. Covers all blood groups (A, B, AB, O)." },
    { key: "bedUtilization", label: "BED UTILIZATION", colorHue: "amber", unit: "%", description: "Non-ICU hospital bed occupancy rate (%). Source: MOH KKMNow dashboard (updates irregularly). Higher values indicate greater strain on hospital capacity." },
    { key: "icuUtilization", label: "ICU UTILIZATION", colorHue: "amber", unit: "%", description: "ICU bed occupancy rate (%). Source: MOH KKMNow dashboard (updates irregularly). Critical indicator of intensive care capacity pressure." },
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
  { key: "epfDividend", label: "EPF DIVIDEND", colorHue: "cyan", changeSuffix: "YoY", description: "Annual dividend rate declared by the Employees Provident Fund (KWSP) for conventional savings." },
];

export interface RankScale {
  /** Per-state position on the ramp, 0 = lowest value, 1 = highest. Ties share a position. */
  t: Record<string, number>;
  min: number;
  max: number;
}

/**
 * Rank (quantile) scale: each state gets a distinct shade regardless of how
 * skewed the values are, so the map never collapses into "one bright state,
 * fifteen dark ones". Needs at least 3 states with data.
 */
export function computeRankScale(values: Record<string, number | undefined>): RankScale | null {
  const sorted = Object.entries(values)
    .filter((e): e is [string, number] => e[1] != null)
    .sort((a, b) => a[1] - b[1]);
  const n = sorted.length;
  if (n < 3) return null;
  const t: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const [name, value] = sorted[i];
    const first = sorted.findIndex(([, v]) => v === value);
    t[name] = first / (n - 1);
  }
  return { t, min: sorted[0][1], max: sorted[n - 1][1] };
}

type RGBA = [number, number, number, number];

// Neutral metrics: dim cyan → bright cyan.
// Concern metrics: cyan (good) → warm grey → amber (bad); blue-orange stays readable for colour-blind users.
const FILL_STOPS: Record<"cyan" | "amber", RGBA[]> = {
  cyan: [[0, 110, 150, 0.18], [0, 212, 255, 0.65]],
  amber: [[0, 110, 150, 0.22], [120, 120, 110, 0.35], [255, 149, 0, 0.65]],
};
const STROKE_STOPS: Record<"cyan" | "amber", RGBA[]> = {
  cyan: [[0, 212, 255, 0.4], [0, 212, 255, 0.85]],
  amber: [[0, 212, 255, 0.4], [180, 170, 150, 0.5], [255, 149, 0, 0.85]],
};
const NO_DATA_FILL = "rgba(30, 40, 55, 0.6)";
const NO_DATA_STROKE = "rgba(100, 140, 170, 0.3)";

function mixStops(stops: RGBA[], t: number): string {
  const pos = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  const f = pos - i;
  const [a, b] = [stops[i], stops[i + 1]];
  const c = a.map((v, k) => v + (b[k] - v) * f);
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${c[3].toFixed(2)})`;
}

/** Fill for a state at ramp position t (undefined = no data) */
export function getRampColor(t: number | undefined, hue: "cyan" | "amber"): string {
  return t == null ? NO_DATA_FILL : mixStops(FILL_STOPS[hue], t);
}

export function getRampStroke(t: number | undefined, hue: "cyan" | "amber"): string {
  return t == null ? NO_DATA_STROKE : mixStops(STROKE_STOPS[hue], t);
}

/** CSS gradient of the full ramp, for legends */
export function getRampGradient(hue: "cyan" | "amber"): string {
  const n = FILL_STOPS[hue].length - 1;
  const stops = FILL_STOPS[hue].map((_, i) => mixStops(FILL_STOPS[hue], i / n));
  return `linear-gradient(90deg, ${stops.join(", ")})`;
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

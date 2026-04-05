/**
 * TypeScript interfaces for Malaysia government data.
 * Shapes match the JSON responses from api.data.gov.my
 * and the normalized cache format used by the ingest script.
 */

// ── Raw API response shapes ──────────────────────────────

export interface PopulationRow {
  age: string;
  sex: string;
  date: string; // "2023-01-01"
  state: string;
  ethnicity: string;
  population: number; // in thousands
}

export interface CrimeRow {
  date: string;
  type: string;
  state: string;
  crimes: number;
  category: string;
  district: string;
}

export interface CpiRow {
  date: string;
  index: number;
  state: string;
  division: string;
}

export interface LfsRow {
  lf: number;
  date: string;
  state: string;
  p_rate: number;
  u_rate: number;
  lf_outside: number;
  lf_employed: number;
  lf_unemployed: number;
}

export interface GdpRow {
  date: string;
  state: string;
  value: number;
  sector: string; // "p0" = total
  series: string;
}

// ── Normalized cache format ──────────────────────────────

export interface StateMetric {
  value: number;
  year: number;
  change?: number; // YoY or QoQ percentage change
  changeLabel?: string; // e.g. "+4.2% YoY"
}

export interface StateYearData {
  population?: StateMetric;
  gdp?: StateMetric;
  crime?: StateMetric;
  unemployment?: StateMetric;
  cpi?: StateMetric;
  householdIncome?: StateMetric;
  // National-only economy metrics (only present in national.years)
  exports?: StateMetric;
  imports?: StateMetric;
  tradeBalance?: StateMetric;
  inflation?: StateMetric;
  ipi?: StateMetric;
  fdi?: StateMetric;
  lei?: StateMetric;
  cei?: StateMetric;
  // Energy & water metrics
  electricityConsumption?: StateMetric; // GWh total
  waterConsumption?: StateMetric; // MLD total
  waterProduction?: StateMetric; // MLD
  waterAccess?: StateMetric; // % households with treated water
}

export interface StateData {
  apiName: string;
  topoName: string;
  years: Record<number, StateYearData>;
  latestYear: number;
}

export interface BnmData {
  opr: { value: number; date: string } | null;
  exchangeRates: Record<string, number>;
}

/** GDP sector breakdown: { agriculture, mining, manufacturing, construction, services } in RM millions */
export interface GdpSectorData {
  agriculture?: number;
  mining?: number;
  manufacturing?: number;
  construction?: number;
  services?: number;
}

/** Blood group breakdown per state per year */
export interface BloodGroupData {
  a: number;
  b: number;
  ab: number;
  o: number;
}

/** Enrolment breakdown: primary vs secondary per state per year */
export interface EnrolmentBreakdownData {
  primary: number;
  secondary: number;
}

/** Crime breakdown: assault (violent) vs property per state per year */
export interface CrimeBreakdownData {
  assault: number;
  property: number;
}

/** Electricity consumption sector breakdown per state per year */
export interface ElectricitySectorData {
  domestic: number;
  commercial: number;
  industrial: number;
  mining: number;
  publicLighting: number;
  agriculture: number;
}

/** Energy cache — loaded from energy-data.json */
export interface EnergyCacheData {
  fetchedAt: string;
  electricityConsumption: Record<string, Record<number, ElectricitySectorData & { total: number }>>;
  electricityTotal: Record<string, Record<number, { value: number; year: number; change?: number }>>;
  nationalConsumptionBySector: Record<number, Record<string, number>>;
  generationByRegion: Record<string, Record<number, number>>;
  generationByFuel: Record<number, Record<string, number>>;
  capacityByRegion: Record<string, Record<number, number>>;
  waterConsumption: Record<string, Record<number, { domestic: number; nonDomestic: number; total: number }>>;
  waterProduction: Record<string, Record<number, number>>;
  waterAccess: Record<string, Record<number, number>>;
  availableYears: number[];
}

export interface CacheData {
  fetchedAt: string; // ISO timestamp
  states: Record<string, StateData>; // keyed by topoName
  national: StateData;
  availableYears: number[];
  /** GDP sector breakdown per state per year */
  gdpSectors?: Record<string, Record<number, GdpSectorData>>;
  /** Crime breakdown per state per year */
  crimeBreakdown?: Record<string, Record<number, CrimeBreakdownData>>;
  /** Blood group breakdown per state per year */
  bloodGroups?: Record<string, Record<number, BloodGroupData>>;
  /** Enrolment breakdown per state per year */
  enrolmentBreakdown?: Record<string, Record<number, EnrolmentBreakdownData>>;
  /** Public transit ridership — yearly totals with rail/bus split */
  ridership?: Record<number, { total: number; rail: number; bus: number }>;
  bnm?: BnmData;
  /** Energy & water data (loaded from energy-data.json) */
  energy?: EnergyCacheData;
}

export interface DataGaps {
  fetchedAt: string;
  gaps: Array<{
    state: string;
    metric: string;
    years: number[];
  }>;
}

// ── Choropleth ───────────────────────────────────────────

export type MetricKey = string;

export interface MetricConfig {
  key: MetricKey;
  label: string;
  format: (value: number) => string;
  colorHue: "cyan" | "amber";
  unit: string;
}

// ── Sparkline ────────────────────────────────────────────

export interface SparklinePoint {
  year: number;
  value: number;
}

// ── Ticker ───────────────────────────────────────────────

export interface Headline {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  matchedStates: string[]; // topoNames
}

export interface ExchangeRate {
  currency: string;
  rate: number;
  change?: number;
}

export interface FuelPrice {
  ron95: number;
  ron97: number;
  diesel: number;
  ron95Budi?: number;
  dieselEastMsia?: number;
  date: string;
}

export interface GoldPrice {
  gold999: number; // MYR per gram (999 purity)
  gold916: number; // MYR per gram (916 purity)
  effectiveDate: string;
}

export interface TickerData {
  headlines: Headline[];
  rates: ExchangeRate[];
  opr?: number;
  fuel?: FuelPrice;
  gold?: GoldPrice;
  fetchedAt: string;
}

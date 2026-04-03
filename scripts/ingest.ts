/**
 * Data ingest script for Pantaulah.
 * Fetches 5 datasets from api.data.gov.my + DOSM storage CSVs,
 * normalizes to cache format, validates coverage, and outputs data-gaps.json.
 *
 * Hybrid approach (API + DOSM publications to get the latest data):
 *   - Population: direct CSV from storage.dosm.gov.my (API no longer updated)
 *   - GDP: API + Excel publication from storage.dosm.gov.my (auto-detects latest year)
 *   - Crime: API + Excel publication from storage.dosm.gov.my (auto-detects latest year)
 *   - CPI, Unemployment: api.data.gov.my (these are kept current)
 *
 * Government data updates infrequently (quarterly at best, often annually).
 * Recommended run frequency: once per month.
 *
 * Run: npm run ingest
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";

// ── Constants ────────────────────────────────────────────

const API_BASE = "https://api.data.gov.my/data-catalogue";
const DOSM_STORAGE = "https://storage.dosm.gov.my";
const CACHE_DIR = join(process.cwd(), "src", "lib", "data", "cache");
const DELAY_MS = 16_000; // 16s between requests (safely under 4/min)
const MIN_YEAR = 2010; // Ignore data before this — other metrics start around 2010

/** Ingest tiers — each tier fetches independently based on its own staleness threshold */
type Tier = "daily" | "monthly" | "annual";
const TIER_STALE_DAYS: Record<Tier, number> = {
  daily: 1,    // organ pledges, PEKA B40, blood donations
  monthly: 30, // CPI, unemployment, trade, inflation, IPI, FDI, economic indicators
  annual: 90,  // GDP, population, crime, education, hospital beds, deaths, births, etc.
};
const TIER_META_PATH = join(process.cwd(), "src", "lib", "data", "cache", "ingest-meta.json");

const STATES_MAP: Record<string, string> = {
  Johor: "Johor",
  Kedah: "Kedah",
  Kelantan: "Kelantan",
  Melaka: "Melaka",
  "Negeri Sembilan": "Negeri Sembilan",
  Pahang: "Pahang",
  Perak: "Perak",
  Perlis: "Perlis",
  "Pulau Pinang": "Penang",
  Sabah: "Sabah",
  Sarawak: "Sarawak",
  Selangor: "Selangor",
  Terengganu: "Terengganu",
  "W.P. Kuala Lumpur": "Kuala Lumpur",
  "W.P. Putrajaya": "Putrajaya",
  "W.P. Labuan": "Labuan",
};

// ── Types ───────────────────────────────────────────────

interface StateYearMetric {
  value: number;
  year: number;
}

type MetricStore = Record<string, Record<number, StateYearMetric>>;

/** National-only metric: keyed by year */
type NationalMetricStore = Record<number, StateYearMetric>;

// ── Helpers ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Load per-tier last-fetched timestamps */
function loadTierMeta(): Record<Tier, string | null> {
  try {
    if (existsSync(TIER_META_PATH)) {
      return JSON.parse(readFileSync(TIER_META_PATH, "utf-8"));
    }
  } catch { /* corrupted, re-fetch all */ }
  return { daily: null, monthly: null, annual: null };
}

function saveTierMeta(meta: Record<Tier, string | null>): void {
  writeFileSync(TIER_META_PATH, JSON.stringify(meta, null, 2));
}

/** Check if a tier needs re-fetching */
function isTierStale(tier: Tier, meta: Record<Tier, string | null>): boolean {
  const lastFetched = meta[tier];
  if (!lastFetched) return true;
  const age = (Date.now() - new Date(lastFetched).getTime()) / (1000 * 60 * 60 * 24);
  return age >= TIER_STALE_DAYS[tier];
}

/** Check if the main cache exists at all */
function cacheExists(): boolean {
  return existsSync(join(CACHE_DIR, "data.json"));
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return row;
  });
}

async function fetchCSV(path: string): Promise<Array<Record<string, string>>> {
  const url = `${DOSM_STORAGE}/${path}`;
  console.log(`  Downloading CSV: ${path}...`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for CSV ${path}`);
      return [];
    }
    const text = await res.text();
    const rows = parseCSV(text);
    console.log(`  Got ${rows.length} rows from CSV`);
    return rows;
  } catch (err) {
    console.error(`  Error downloading CSV ${path}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/**
 * Try to download an Excel file from DOSM storage, trying publication years
 * from most recent to oldest. DOSM names publications by release year, which
 * is typically 1 year after the data year (e.g. crime_2025.xlsx has 2024 data).
 *
 * Returns the workbook + the publication year that succeeded, or null.
 */
async function fetchDosmExcel(
  pathTemplate: (year: number) => string,
  label: string,
): Promise<{ wb: XLSX.WorkBook; pubYear: number } | null> {
  const currentYear = new Date().getFullYear();
  // Try current year down to 2 years back
  for (let pubYear = currentYear; pubYear >= currentYear - 2; pubYear--) {
    const path = pathTemplate(pubYear);
    const url = `${DOSM_STORAGE}/${path}`;
    console.log(`  Trying ${label} ${pubYear}: ${path}...`);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.log(`    Not found (${res.status})`);
        continue;
      }
      // HEAD succeeded — now download
      const dlRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!dlRes.ok) continue;
      const buf = await dlRes.arrayBuffer();
      const wb = XLSX.read(buf);
      console.log(`    Found! Sheets: ${wb.SheetNames.length}`);
      return { wb, pubYear };
    } catch {
      continue;
    }
  }
  console.log(`  No ${label} Excel publication found.`);
  return null;
}

async function fetchGdpExcel(): Promise<MetricStore> {
  const result = await fetchDosmExcel(
    (y) => `gdp/gdp_state_${y}.xlsx`,
    "GDP",
  );
  if (!result) return {};

  const { wb } = result;
  // "Jad 1-3" sheet has Table 1: GDP by state at constant 2015 prices
  const sheet = wb.Sheets["Jad 1-3"];
  if (!sheet) {
    console.error(`  Sheet "Jad 1-3" not found in GDP Excel`);
    return {};
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  // Row 4 has year headers: [null, "Negeri", null, null, 2015, null, 2016, ...]
  // Due to merged cells, header years are at cols 4,6,8,... but data values
  // are at cols 3,5,7,... (offset by -1). We store the data column index.
  const headerRow = rows[4] as (string | number | null)[];
  const yearCols: { year: number; col: number }[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    let year: number | null = null;
    if (typeof val === "number" && val >= 2010 && val <= 2030) {
      year = val;
    } else if (typeof val === "string") {
      const match = val.match(/^(\d{4})/);
      if (match) year = parseInt(match[1]);
    }
    if (year !== null) yearCols.push({ year, col: c - 1 }); // -1: data offset from header
  }

  const store: MetricStore = {};
  for (let r = 7; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    if (!row || row.length < 3) continue;
    const stateName = String(row[1] || "").replace(/\d+$/, "").trim(); // Strip footnote numbers
    if (!stateName || stateName.toLowerCase() === "supra") continue;

    const topo = toTopoName(stateName);
    if (!topo) continue;

    for (const { year, col } of yearCols) {
      const value = row[col] as number | undefined;
      if (typeof value !== "number" || isNaN(value)) continue;
      if (!store[topo]) store[topo] = {};
      store[topo][year] = { value, year };
    }
  }

  const stateCount = Object.keys(store).length;
  console.log(`  Parsed GDP Excel: ${stateCount} states, ${yearCols.length} years (${yearCols[0]?.year}-${yearCols[yearCols.length - 1]?.year})`);
  return store;
}

async function fetchCrimeExcel(): Promise<MetricStore> {
  const result = await fetchDosmExcel(
    (y) => `crime/crime_${y}.xlsx`,
    "Crime",
  );
  if (!result) return {};

  const { wb } = result;
  // Sheet " 1.1" has Table 1.1: Crime index by contingent
  // Format: [null, "State Name", null, year, total, assault, property]
  // States are in groups of rows, with empty rows between them.
  // "Sabaha" includes W.P. Labuan; "W.P. Kuala Lumpurb" includes W.P. Putrajaya.
  const sheetName = wb.SheetNames.find((s) => s.trim() === "1.1");
  if (!sheetName) {
    console.error(`  Sheet "1.1" not found in Crime Excel`);
    return {};
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }) as unknown[][];

  const store: MetricStore = {};
  let currentState: string | null = null;

  for (const row of rows) {
    if (!row || row.length < 5) { currentState = null; continue; }

    // Check if this row has a state name (col 1)
    const col1 = row[1];
    if (typeof col1 === "string" && col1.trim()) {
      // State names may have footnote letters appended (e.g. "Sabaha", "W.P. Kuala Lumpurb")
      // Try the name as-is first, then try stripping 1 trailing char for footnotes
      let name = col1.trim();
      if (name === "Malaysia") { currentState = null; continue; }
      if (toTopoName(name)) {
        currentState = name;
      } else if (toTopoName(name.slice(0, -1))) {
        currentState = name.slice(0, -1);
      } else {
        currentState = name; // Keep as-is, toTopoName will filter it out below
      }
    }

    // Extract year + total crime
    const year = row[3] as number | undefined;
    const total = row[4] as number | undefined;
    if (typeof year !== "number" || typeof total !== "number") continue;
    if (year < MIN_YEAR) continue;
    if (!currentState) continue;

    const topo = toTopoName(currentState);
    if (!topo) continue;

    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value: total, year };
  }

  const stateCount = Object.keys(store).length;
  const allYears = new Set<number>();
  for (const s of Object.values(store)) for (const y of Object.keys(s)) allYears.add(parseInt(y));
  const sorted = [...allYears].sort();
  console.log(`  Parsed Crime Excel: ${stateCount} states, years ${sorted[0]}-${sorted[sorted.length - 1]}`);
  return store;
}

async function fetchDataset(
  id: string,
  params: Record<string, string> = {},
  limit = 10000
): Promise<unknown[]> {
  const url = new URL(API_BASE);
  url.searchParams.set("id", id);
  url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  console.log(`  Fetching ${id}...`);
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });

      if (res.status === 429) {
        console.log(`  Rate limited (429), waiting 30s before retry ${attempt}/${maxRetries}`);
        await sleep(30_000);
        continue;
      }

      if (!res.ok) {
        console.error(`  HTTP ${res.status} for ${id}, attempt ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) { await sleep(5_000); continue; }
        return [];
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        console.error(`  Non-array response for ${id}`);
        return [];
      }

      console.log(`  Got ${data.length} rows for ${id}`);
      return data;
    } catch (err) {
      console.error(`  Error fetching ${id}: ${err instanceof Error ? err.message : err}`);
      if (attempt < maxRetries) { await sleep(5_000); continue; }
      return [];
    }
  }
  return [];
}

function toTopoName(apiName: string): string | undefined {
  return STATES_MAP[apiName];
}

// ── Dataset processors ───────────────────────────────────

function processPopulationCSV(rows: Array<Record<string, string>>): MetricStore {
  const store: MetricStore = {};
  for (const row of rows) {
    // CSV uses: sex=both, age=overall, ethnicity=overall
    if (row.age !== "overall" || row.sex !== "both" || row.ethnicity !== "overall") continue;
    const topo = toTopoName(row.state);
    if (!topo) continue;
    const year = new Date(row.date).getFullYear();
    const value = parseFloat(row.population);
    if (isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

function processPopulation(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.age !== "overall_age" || row.sex !== "overall_sex" || row.ethnicity !== "overall_ethnicity") continue;
    const apiName = row.state as string;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.population as number;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

function processCrime(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  // Sum category "all" totals (assault + property) per state per year — avoid subtypes
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.district !== "All" || row.type !== "all") continue;
    const apiName = row.state as string;
    if (apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.crimes as number;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      const year = parseInt(yearStr);
      store[topo][year] = { value, year };
    }
  }
  return store;
}

/** Crime breakdown: assault vs property per state per year */
type CrimeBreakdownStore = Record<string, Record<number, { assault: number; property: number }>>;

function processCrimeBreakdown(rows: unknown[]): CrimeBreakdownStore {
  const store: CrimeBreakdownStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.district !== "All" || row.type !== "all") continue;
    const cat = row.category as string;
    if (cat !== "assault" && cat !== "property") continue;
    const apiName = row.state as string;
    if (apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.crimes as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    if (!store[topo][year]) store[topo][year] = { assault: 0, property: 0 };
    store[topo][year][cat as "assault" | "property"] = value;
  }
  return store;
}

/** Homicide rate per 100K (SDG 16.1.1) */
function processHomicideRate(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.value as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** Drug addicts — sum total across age groups per state per year */
function processDrugAddicts(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.age_group !== "total") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.addicts as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

function processCpi(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  // Group by state+year, take December reading (or latest available)
  const byStateYear: Record<string, { value: number; month: number }> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.division !== "overall") continue;
    const apiName = row.state as string;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    const month = d.getMonth();
    const key = `${topo}:${year}`;
    if (!byStateYear[key] || month > byStateYear[key].month) {
      byStateYear[key] = { value: row.index as number, month };
    }
  }
  for (const [key, data] of Object.entries(byStateYear)) {
    const [topo, yearStr] = key.split(":");
    const year = parseInt(yearStr);
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value: data.value, year };
  }
  return store;
}

function processLfs(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  // Group by state+year, take Q4 reading (or latest available)
  const byStateYear: Record<string, { value: number; quarter: number }> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const apiName = row.state as string;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    const quarter = d.getMonth();
    const key = `${topo}:${year}`;
    if (!byStateYear[key] || quarter > byStateYear[key].quarter) {
      byStateYear[key] = { value: row.u_rate as number, quarter };
    }
  }
  for (const [key, data] of Object.entries(byStateYear)) {
    const [topo, yearStr] = key.split(":");
    const year = parseInt(yearStr);
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value: data.value, year };
  }
  return store;
}

function processGdp(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sector !== "p0" || row.series !== "abs") continue;
    const apiName = row.state as string;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.value as number;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** GDP sector breakdown — keyed by state → year → { agriculture, mining, manufacturing, construction, services } */
type GdpSectorStore = Record<string, Record<number, Record<string, number>>>;

const GDP_SECTORS: Record<string, string> = {
  p1: "agriculture",
  p2: "mining",
  p3: "manufacturing",
  p4: "construction",
  p5: "services",
};

function processGdpSectors(rows: unknown[]): GdpSectorStore {
  const store: GdpSectorStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.series !== "abs") continue;
    const sectorKey = GDP_SECTORS[row.sector as string];
    if (!sectorKey) continue;
    const apiName = row.state as string;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.value as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    if (!store[topo][year]) store[topo][year] = {};
    store[topo][year][sectorKey] = value;
  }
  return store;
}

// ── Health processors ────────────────────────────────────

function processDailyByState(rows: unknown[], valueField: string): MetricStore {
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row[valueField] as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  const store: MetricStore = {};
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      store[topo][parseInt(yearStr)] = { value, year: parseInt(yearStr) };
    }
  }
  return store;
}

/** Healthcare staff (doctors) by state — annual, take type=doctor */
function processDoctors(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.type !== "doctor") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.staff as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** Hospital beds by state — annual, take type=all */
function processHospitalBeds(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.type !== "all") continue;
    if (row.district !== "All Districts" && row.district !== "All") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.beds as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** Blood donation breakdown by blood group per state per year */
type BloodGroupStore = Record<string, Record<number, { a: number; b: number; ab: number; o: number }>>;

function processBloodGroups(rows: Array<Record<string, string>>): BloodGroupStore {
  const store: BloodGroupStore = {};
  for (const row of rows) {
    const bt = row.blood_type;
    if (bt !== "a" && bt !== "b" && bt !== "ab" && bt !== "o") continue;
    const topo = toTopoName(row.state);
    if (!topo) continue;
    const year = new Date(row.date).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = parseInt(row.donations);
    if (isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    if (!store[topo][year]) store[topo][year] = { a: 0, b: 0, ab: 0, o: 0 };
    store[topo][year][bt] += value;
  }
  return store;
}

/** Blood donations by state — daily CSV, sum by state+year, blood_type=all */
function processBloodDonations(rows: Array<Record<string, string>>): MetricStore {
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows) {
    if (row.blood_type !== "all") continue;
    const topo = toTopoName(row.state);
    if (!topo) continue;
    const year = new Date(row.date).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = parseInt(row.donations);
    if (isNaN(value)) continue;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  const store: MetricStore = {};
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      store[topo][parseInt(yearStr)] = { value, year: parseInt(yearStr) };
    }
  }
  return store;
}

/** Death rate / birth rate by state — already has rate field (per 1K population) */
function processVitalRate(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.rate as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

// ── Transport processors ─────────────────────────────────

/** Download yearly vehicle registration CSVs from JPJ/DOSM storage and count per state */
async function fetchVehicleRegistrations(): Promise<MetricStore> {
  const store: MetricStore = {};
  const currentYear = new Date().getFullYear();

  for (let year = MIN_YEAR; year <= currentYear; year++) {
    const url = `${DOSM_STORAGE.replace("storage.dosm.gov.my", "storage.data.gov.my")}/transportation/cars_${year}.csv`;
    console.log(`  Downloading vehicle registrations ${year}...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        console.log(`    Not found (${res.status})`);
        continue;
      }

      const text = await res.text();
      const lines = text.split("\n");
      const counts: Record<string, number> = {};

      // Skip header, count rows per state (last CSV column)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const lastComma = line.lastIndexOf(",");
        const state = line.substring(lastComma + 1).trim();
        const topo = toTopoName(state);
        if (topo) {
          counts[topo] = (counts[topo] || 0) + 1;
        }
      }

      for (const [topo, count] of Object.entries(counts)) {
        if (!store[topo]) store[topo] = {};
        store[topo][year] = { value: count, year };
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`    ${year}: ${total.toLocaleString()} registrations across ${Object.keys(counts).length} states`);
    } catch (err) {
      console.error(`    Error fetching ${year}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return store;
}

/** Download yearly motorcycle registration CSVs from JPJ/DOSM storage and count per state */
async function fetchMotorcycleRegistrations(): Promise<MetricStore> {
  const store: MetricStore = {};
  const currentYear = new Date().getFullYear();

  for (let year = MIN_YEAR; year <= currentYear; year++) {
    const url = `${DOSM_STORAGE.replace("storage.dosm.gov.my", "storage.data.gov.my")}/transportation/motorcycles_${year}.csv`;
    console.log(`  Downloading motorcycle registrations ${year}...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        console.log(`    Not found (${res.status})`);
        continue;
      }

      const text = await res.text();
      const lines = text.split("\n");
      const counts: Record<string, number> = {};

      // Skip header, count rows per state (last CSV column)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const lastComma = line.lastIndexOf(",");
        const state = line.substring(lastComma + 1).trim();
        const topo = toTopoName(state);
        if (topo) {
          counts[topo] = (counts[topo] || 0) + 1;
        }
      }

      for (const [topo, count] of Object.entries(counts)) {
        if (!store[topo]) store[topo] = {};
        store[topo][year] = { value: count, year };
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`    ${year}: ${total.toLocaleString()} motorcycle registrations across ${Object.keys(counts).length} states`);
    } catch (err) {
      console.error(`    Error fetching ${year}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return store;
}

/** Public transit ridership — daily national data, aggregate to yearly totals + rail/bus split */
type RidershipStore = Record<number, { total: number; rail: number; bus: number }>;

function processRidership(rows: unknown[]): RidershipStore {
  const store: RidershipStore = {};
  const railKeys = ["rail_ets", "rail_lrt_kj", "rail_tebrau", "rail_komuter", "rail_mrt_pjy", "rail_monorail", "rail_intercity", "rail_lrt_ampang", "rail_mrt_kajang", "rail_komuter_utara"];
  const busKeys = ["bus_rkl", "bus_rkn", "bus_rpn"];

  for (const row of rows as Array<Record<string, unknown>>) {
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    if (!store[year]) store[year] = { total: 0, rail: 0, bus: 0 };
    let railDay = 0, busDay = 0;
    for (const k of railKeys) {
      const v = row[k] as number;
      if (typeof v === "number" && !isNaN(v)) railDay += v;
    }
    for (const k of busKeys) {
      const v = row[k] as number;
      if (typeof v === "number" && !isNaN(v)) busDay += v;
    }
    store[year].rail += railDay;
    store[year].bus += busDay;
    store[year].total += railDay + busDay;
  }
  return store;
}

// ── Education processors ─────────────────────────────────

/** School completion rate — take upper secondary (most meaningful), sex=both */
function processCompletion(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both") continue;
    if (row.stage !== "secondary_upper") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.completion as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** Literacy rate (SDG 4.6.1) — age=15+, sex=both */
function processLiteracy(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both" || row.age !== "15+") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.proportion as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

/** Education breakdown: primary vs secondary enrolment per state per year */
type EducationBreakdownStore = Record<string, Record<number, { primary: number; secondary: number }>>;

function processEnrolmentBreakdown(rows: unknown[]): EducationBreakdownStore {
  const store: EducationBreakdownStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both") continue;
    if (row.district !== "All Districts") continue;
    const stage = row.stage as string;
    if (stage !== "primary" && stage !== "secondary") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const value = row.students as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    if (!store[topo][year]) store[topo][year] = { primary: 0, secondary: 0 };
    store[topo][year][stage as "primary" | "secondary"] = value;
  }
  return store;
}

function processSchools(rows: unknown[]): MetricStore {
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    if (row.district !== "All Districts") continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.schools as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  const store: MetricStore = {};
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      store[topo][parseInt(yearStr)] = { value, year: parseInt(yearStr) };
    }
  }
  return store;
}

function processEnrolment(rows: unknown[]): MetricStore {
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both") continue;
    if (row.district !== "All Districts") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.students as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  const store: MetricStore = {};
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      store[topo][parseInt(yearStr)] = { value, year: parseInt(yearStr) };
    }
  }
  return store;
}

function processTeachers(rows: unknown[]): MetricStore {
  const sums: Record<string, Record<number, number>> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.sex !== "both") continue;
    if (row.district !== "All Districts") continue;
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.teachers as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!sums[topo]) sums[topo] = {};
    sums[topo][year] = (sums[topo][year] || 0) + value;
  }
  const store: MetricStore = {};
  for (const [topo, years] of Object.entries(sums)) {
    store[topo] = {};
    for (const [yearStr, value] of Object.entries(years)) {
      store[topo][parseInt(yearStr)] = { value, year: parseInt(yearStr) };
    }
  }
  return store;
}

// ── Economy: Household Income (state-level) ─────────────

function processHouseholdIncome(rows: unknown[]): MetricStore {
  const store: MetricStore = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const apiName = row.state as string;
    if (!apiName || apiName === "Malaysia") continue;
    const topo = toTopoName(apiName);
    if (!topo) continue;
    const year = new Date(row.date as string).getFullYear();
    const value = row.income_median as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!store[topo]) store[topo] = {};
    store[topo][year] = { value, year };
  }
  return store;
}

// ── National-only economy processors ────────────────────

/** Trade (exports/imports) — monthly, aggregate to annual */
function processTrade(rows: unknown[]): { exports: NationalMetricStore; imports: NationalMetricStore; tradeBalance: NationalMetricStore } {
  const expByYear: Record<number, number> = {};
  const impByYear: Record<number, number> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.section !== "overall") continue;
    const year = new Date(row.date as string).getFullYear();
    if (year < MIN_YEAR) continue;
    const exp = row.exports as number;
    const imp = row.imports as number;
    if (typeof exp === "number") expByYear[year] = (expByYear[year] || 0) + exp;
    if (typeof imp === "number") impByYear[year] = (impByYear[year] || 0) + imp;
  }
  const exports: NationalMetricStore = {};
  const imports: NationalMetricStore = {};
  const tradeBalance: NationalMetricStore = {};
  for (const yearStr of Object.keys(expByYear)) {
    const year = parseInt(yearStr);
    exports[year] = { value: expByYear[year], year };
    imports[year] = { value: impByYear[year] || 0, year };
    tradeBalance[year] = { value: expByYear[year] - (impByYear[year] || 0), year };
  }
  return { exports, imports, tradeBalance };
}

/** CPI Headline Inflation — monthly, take December reading (or latest) per year */
function processInflation(rows: unknown[]): NationalMetricStore {
  const byYear: Record<number, { value: number; month: number }> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.division !== "overall") continue;
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    if (year < MIN_YEAR) continue;
    const month = d.getMonth();
    const value = row.inflation_yoy as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!byYear[year] || month > byYear[year].month) {
      byYear[year] = { value, month };
    }
  }
  const store: NationalMetricStore = {};
  for (const [yearStr, data] of Object.entries(byYear)) {
    const year = parseInt(yearStr);
    store[year] = { value: data.value, year };
  }
  return store;
}

/** Industrial Production Index — monthly, take December reading (or latest) per year */
function processIpi(rows: unknown[]): NationalMetricStore {
  const byYear: Record<number, { value: number; month: number }> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.series !== "abs") continue;
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    if (year < MIN_YEAR) continue;
    const month = d.getMonth();
    const value = row.index as number;
    if (typeof value !== "number" || isNaN(value)) continue;
    if (!byYear[year] || month > byYear[year].month) {
      byYear[year] = { value, month };
    }
  }
  const store: NationalMetricStore = {};
  for (const [yearStr, data] of Object.entries(byYear)) {
    const year = parseInt(yearStr);
    store[year] = { value: data.value, year };
  }
  return store;
}

/** FDI Flows — quarterly, sum to annual net FDI (RM billions) */
function processFdi(rows: unknown[]): NationalMetricStore {
  const byYear: Record<number, number> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    if (year < MIN_YEAR) continue;
    const net = row.net as number;
    if (typeof net !== "number" || isNaN(net)) continue;
    byYear[year] = (byYear[year] || 0) + net;
  }
  const store: NationalMetricStore = {};
  for (const [yearStr, value] of Object.entries(byYear)) {
    const year = parseInt(yearStr);
    store[year] = { value, year };
  }
  return store;
}

/** Economic Indicators (LEI/CEI) — monthly, take December (or latest) per year */
function processEconomicIndicators(rows: unknown[]): { lei: NationalMetricStore; cei: NationalMetricStore } {
  const leiByYear: Record<number, { value: number; month: number }> = {};
  const ceiByYear: Record<number, { value: number; month: number }> = {};
  for (const row of rows as Array<Record<string, unknown>>) {
    const d = new Date(row.date as string);
    const year = d.getFullYear();
    if (year < MIN_YEAR) continue;
    const month = d.getMonth();
    const leading = row.leading as number;
    const coincident = row.coincident as number;
    if (typeof leading === "number" && !isNaN(leading)) {
      if (!leiByYear[year] || month > leiByYear[year].month) {
        leiByYear[year] = { value: leading, month };
      }
    }
    if (typeof coincident === "number" && !isNaN(coincident)) {
      if (!ceiByYear[year] || month > ceiByYear[year].month) {
        ceiByYear[year] = { value: coincident, month };
      }
    }
  }
  const lei: NationalMetricStore = {};
  const cei: NationalMetricStore = {};
  for (const [yearStr, data] of Object.entries(leiByYear)) {
    const year = parseInt(yearStr);
    lei[year] = { value: data.value, year };
  }
  for (const [yearStr, data] of Object.entries(ceiByYear)) {
    const year = parseInt(yearStr);
    cei[year] = { value: data.value, year };
  }
  return { lei, cei };
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log("PANTAULAH DATA INGEST");
  console.log("=====================\n");

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const forceFlag = process.argv.includes("--force");
  const forceTier = process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1] as Tier | undefined;
  const firstRun = !cacheExists();
  const tierMeta = loadTierMeta();

  // Determine which tiers need fetching
  const fetchDaily = forceFlag || firstRun || forceTier === "daily" || isTierStale("daily", tierMeta);
  const fetchMonthly = forceFlag || firstRun || forceTier === "monthly" || isTierStale("monthly", tierMeta);
  const fetchAnnual = forceFlag || firstRun || forceTier === "annual" || isTierStale("annual", tierMeta);

  if (!fetchDaily && !fetchMonthly && !fetchAnnual) {
    console.log("  All tiers are fresh. Use --force to re-fetch anyway.");
    console.log("  Tier status:");
    for (const tier of ["daily", "monthly", "annual"] as Tier[]) {
      const last = tierMeta[tier];
      const age = last ? Math.round((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24) * 10) / 10 : "never";
      console.log(`    ${tier}: ${age}d old (threshold: ${TIER_STALE_DAYS[tier]}d)`);
    }
    console.log("\nDone (skipped).");
    return;
  }

  console.log("  Tiers to fetch:");
  console.log(`    daily:   ${fetchDaily ? "YES" : "skip (fresh)"}`);
  console.log(`    monthly: ${fetchMonthly ? "YES" : "skip (fresh)"}`);
  console.log(`    annual:  ${fetchAnnual ? "YES" : "skip (fresh)"}\n`);

  // ── DAILY tier: organ pledges, PEKA B40, blood donations ──
  let organRows: unknown[] = [];
  let pekabRows: unknown[] = [];
  let bloodDonationRows: Array<Record<string, string>> = [];
  let ridershipRows: unknown[] = [];
  if (fetchDaily) {
    console.log("── DAILY TIER ──");
    organRows = await fetchDataset("organ_pledges_state", {}, 200000);
    await sleep(DELAY_MS);
    pekabRows = await fetchDataset("pekab40_screenings_state", {}, 100000);
    await sleep(DELAY_MS);
    console.log("  Fetching blood donations CSV...");
    const url = "https://storage.data.gov.my/healthcare/blood_donations_state.csv";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (res.ok) {
        const text = await res.text();
        bloodDonationRows = parseCSV(text);
        console.log(`  Got ${bloodDonationRows.length} rows from blood donations CSV`);
      }
    } catch (err) {
      console.error(`  Error fetching blood donations: ${err instanceof Error ? err.message : err}`);
    }
    ridershipRows = await fetchDataset("ridership_headline", {}, 100000);
    await sleep(DELAY_MS);
    tierMeta.daily = new Date().toISOString();
  }

  // ── MONTHLY tier: CPI, unemployment, trade, inflation, IPI, FDI, indicators ──
  let cpiRows: unknown[] = [];
  let lfsRows: unknown[] = [];
  let tradeRows: unknown[] = [];
  let inflationRows: unknown[] = [];
  let ipiRows: unknown[] = [];
  let fdiRows: unknown[] = [];
  let econIndicatorRows: unknown[] = [];
  if (fetchMonthly) {
    console.log("\n── MONTHLY TIER ──");
    cpiRows = await fetchDataset("cpi_state", { filter: "overall@division" });
    await sleep(DELAY_MS);
    lfsRows = await fetchDataset("lfs_qtr_state");
    await sleep(DELAY_MS);
    tradeRows = await fetchDataset("trade_sitc_1d", { filter: "overall@section" });
    await sleep(DELAY_MS);
    inflationRows = await fetchDataset("cpi_headline_inflation", { filter: "overall@division" });
    await sleep(DELAY_MS);
    ipiRows = await fetchDataset("ipi", { filter: "abs@series" });
    await sleep(DELAY_MS);
    fdiRows = await fetchDataset("fdi_flows");
    await sleep(DELAY_MS);
    econIndicatorRows = await fetchDataset("economic_indicators");
    await sleep(DELAY_MS);
    tierMeta.monthly = new Date().toISOString();
  }

  // ── ANNUAL tier: population, GDP, crime, education, health infra, etc. ──
  let populationCSVRows: Array<Record<string, string>> = [];
  let crimeRows: unknown[] = [];
  let drugAddictsRows: unknown[] = [];
  let homicideRows: unknown[] = [];
  let gdpRows: unknown[] = [];
  let healthStaffRows: unknown[] = [];
  let hospitalBedsRows: unknown[] = [];
  let deathsStateRows: unknown[] = [];
  let birthsStateRows: unknown[] = [];
  let schoolsRows: unknown[] = [];
  let enrolmentRows: unknown[] = [];
  let teachersRows: unknown[] = [];
  let completionRows: unknown[] = [];
  let literacyRows: unknown[] = [];
  let hhIncomeRows: unknown[] = [];
  if (fetchAnnual) {
    console.log("\n── ANNUAL TIER ──");
    populationCSVRows = await fetchCSV("population/population_state.csv");
    crimeRows = await fetchDataset("crime_district", { filter: "All@district" });
    await sleep(DELAY_MS);
    drugAddictsRows = await fetchDataset("drug_addicts_age", { filter: "total@age_group" });
    await sleep(DELAY_MS);
    homicideRows = await fetchDataset("sdg_16-1-1", { filter: "both@sex" });
    await sleep(DELAY_MS);
    gdpRows = await fetchDataset("gdp_state_real_supply", { filter: "abs@series" });
    await sleep(DELAY_MS);
    healthStaffRows = await fetchDataset("healthcare_staff", { filter: "doctor@type" });
    await sleep(DELAY_MS);
    hospitalBedsRows = await fetchDataset("hospital_beds", { filter: "all@type" });
    await sleep(DELAY_MS);
    deathsStateRows = await fetchDataset("deaths_state");
    await sleep(DELAY_MS);
    birthsStateRows = await fetchDataset("births_annual_state");
    await sleep(DELAY_MS);
    schoolsRows = await fetchDataset("schools_district");
    await sleep(DELAY_MS);
    enrolmentRows = await fetchDataset("enrolment_school_district", { filter: "both@sex" });
    await sleep(DELAY_MS);
    teachersRows = await fetchDataset("teachers_district", { filter: "both@sex" });
    await sleep(DELAY_MS);
    completionRows = await fetchDataset("completion_school_state", { filter: "both@sex" });
    await sleep(DELAY_MS);
    literacyRows = await fetchDataset("sdg_04-6-1", { filter: "both@sex" });
    await sleep(DELAY_MS);
    hhIncomeRows = await fetchDataset("hh_income_state");
    await sleep(DELAY_MS);
    tierMeta.annual = new Date().toISOString();
  }

  // Transport (annual — part of annual tier)
  let vehicleReg: MetricStore = {};
  let motorcycleReg: MetricStore = {};
  if (fetchAnnual) {
    console.log("\n  Fetching Transport datasets...");
    vehicleReg = await fetchVehicleRegistrations();
    motorcycleReg = await fetchMotorcycleRegistrations();
  }

  // Excel publications (annual tier)
  let gdpExcel: MetricStore = {};
  let crimeExcel: MetricStore = {};
  if (fetchAnnual) {
    console.log("\n  Checking DOSM Excel publications...");
    gdpExcel = await fetchGdpExcel();
    crimeExcel = await fetchCrimeExcel();
  }

  // Load existing cache to preserve data from skipped tiers
  let existingCache: Record<string, unknown> | null = null;
  const cachePath = join(CACHE_DIR, "data.json");
  if (existsSync(cachePath) && (!fetchDaily || !fetchMonthly || !fetchAnnual)) {
    try {
      existingCache = JSON.parse(readFileSync(cachePath, "utf-8"));
      console.log("  Loaded existing cache for tier merge.");
    } catch { /* will rebuild from scratch */ }
  }

  // Process into normalized format
  console.log("\nProcessing datasets...");
  const population = populationCSVRows.length > 0
    ? processPopulationCSV(populationCSVRows)
    : processPopulation([]); // CSV failed — no population data
  const crimeApi = processCrime(crimeRows);
  const crimeBreakdown = processCrimeBreakdown(crimeRows);
  const drugAddicts = processDrugAddicts(drugAddictsRows);
  const homicideRate = processHomicideRate(homicideRows);
  const cpi = processCpi(cpiRows);
  const unemployment = processLfs(lfsRows);
  const gdpApi = processGdp(gdpRows);
  const gdpSectors = processGdpSectors(gdpRows);

  // Merge: API is primary, Excel supplements missing years
  function mergeStores(primary: MetricStore, supplement: MetricStore): MetricStore {
    const merged: MetricStore = {};
    const allStates = new Set([...Object.keys(primary), ...Object.keys(supplement)]);
    for (const state of allStates) {
      merged[state] = { ...supplement[state], ...primary[state] };
    }
    return merged;
  }
  const gdp = mergeStores(gdpApi, gdpExcel);
  const crime = mergeStores(crimeApi, crimeExcel);

  // Process new category datasets
  console.log("  Processing Health datasets...");
  const organPledges = processDailyByState(organRows, "pledges");
  const healthScreenings = processDailyByState(pekabRows, "screenings");
  const doctors = processDoctors(healthStaffRows);
  const hospitalBeds = processHospitalBeds(hospitalBedsRows);
  const deathRate = processVitalRate(deathsStateRows);
  const birthRate = processVitalRate(birthsStateRows);
  const bloodDonations = processBloodDonations(bloodDonationRows);
  const bloodGroups = processBloodGroups(bloodDonationRows);
  const ridership = processRidership(ridershipRows);

  console.log("  Processing Transport datasets...");
  // vehicleReg already processed during fetch

  console.log("  Processing Education datasets...");
  const schools = processSchools(schoolsRows);
  const enrolment = processEnrolment(enrolmentRows);
  const teachers = processTeachers(teachersRows);
  const completion = processCompletion(completionRows);
  const literacy = processLiteracy(literacyRows);
  const enrolmentBreakdown = processEnrolmentBreakdown(enrolmentRows);

  // Process new economy datasets
  console.log("  Processing new Economy datasets...");
  const householdIncome = processHouseholdIncome(hhIncomeRows);
  const trade = processTrade(tradeRows);
  const inflation = processInflation(inflationRows);
  const ipi = processIpi(ipiRows);
  const fdi = processFdi(fdiRows);
  const econIndicators = processEconomicIndicators(econIndicatorRows);

  // Build unified cache
  const allTopoNames = Object.keys(STATES_MAP).map((k) => STATES_MAP[k]);
  const uniqueNames = [...new Set(allTopoNames)];

  const allYears = new Set<number>();
  const states: Record<string, Record<number, Record<string, StateYearMetric | undefined>>> = {};

  // Compute GDP per capita: (GDP in RM millions) / (population in thousands) * 1000 = RM per person
  const gdpPerCapita: MetricStore = {};
  for (const topo of Object.keys(gdp)) {
    gdpPerCapita[topo] = {};
    for (const [yearStr, gdpMetric] of Object.entries(gdp[topo])) {
      const year = parseInt(yearStr);
      const pop = population[topo]?.[year];
      if (pop && pop.value > 0) {
        const value = (gdpMetric.value / pop.value) * 1000; // RM per person
        gdpPerCapita[topo][year] = { value, year };
      }
    }
  }

  // Compute crime rate per 100K: (crimes / (population * 1000)) * 100000
  const crimeRate: MetricStore = {};
  for (const topo of Object.keys(crime)) {
    crimeRate[topo] = {};
    for (const [yearStr, crimeMetric] of Object.entries(crime[topo])) {
      const year = parseInt(yearStr);
      const pop = population[topo]?.[year];
      if (pop && pop.value > 0) {
        const value = (crimeMetric.value / (pop.value * 1000)) * 100000;
        crimeRate[topo][year] = { value, year };
      }
    }
  }

  // Compute doctors per 10K population: (doctors / (population * 1000)) * 10000
  const doctorsPerCapita: MetricStore = {};
  for (const topo of Object.keys(doctors)) {
    doctorsPerCapita[topo] = {};
    for (const [yearStr, docMetric] of Object.entries(doctors[topo])) {
      const year = parseInt(yearStr);
      const pop = population[topo]?.[year];
      if (pop && pop.value > 0) {
        const value = (docMetric.value / (pop.value * 1000)) * 10000;
        doctorsPerCapita[topo][year] = { value, year };
      }
    }
  }

  // Compute hospital beds per 10K population
  const bedsPerCapita: MetricStore = {};
  for (const topo of Object.keys(hospitalBeds)) {
    bedsPerCapita[topo] = {};
    for (const [yearStr, bedMetric] of Object.entries(hospitalBeds[topo])) {
      const year = parseInt(yearStr);
      const pop = population[topo]?.[year];
      if (pop && pop.value > 0) {
        const value = (bedMetric.value / (pop.value * 1000)) * 10000;
        bedsPerCapita[topo][year] = { value, year };
      }
    }
  }

  // Compute student-teacher ratio: enrolment / teachers
  const studentTeacherRatio: MetricStore = {};
  for (const topo of Object.keys(enrolment)) {
    studentTeacherRatio[topo] = {};
    for (const [yearStr, enrolMetric] of Object.entries(enrolment[topo])) {
      const year = parseInt(yearStr);
      const teach = teachers[topo]?.[year];
      if (teach && teach.value > 0) {
        const value = enrolMetric.value / teach.value;
        studentTeacherRatio[topo][year] = { value, year };
      }
    }
  }

  const ALL_METRICS: Record<string, MetricStore> = {
    population, crime, crimeRate, cpi, unemployment, gdp, gdpPerCapita, householdIncome,
    organPledges, healthScreenings, doctorsPerCapita, bedsPerCapita, deathRate, birthRate, bloodDonations,
    drugAddicts, homicideRate,
    vehicleReg, motorcycleReg,
    schools, enrolment, teachers, completion, literacy, studentTeacherRatio,
  };

  /** National-only metrics (not per-state) */
  const NATIONAL_ONLY: Record<string, NationalMetricStore> = {
    exports: trade.exports,
    imports: trade.imports,
    tradeBalance: trade.tradeBalance,
    inflation: inflation,
    ipi: ipi,
    fdi: fdi,
    lei: econIndicators.lei,
    cei: econIndicators.cei,
  };

  for (const topo of uniqueNames) {
    states[topo] = {};
    for (const [metricName, store] of Object.entries(ALL_METRICS)) {
      const stateData = store[topo];
      if (!stateData) continue;
      for (const [yearStr, metric] of Object.entries(stateData)) {
        const year = parseInt(yearStr);
        allYears.add(year);
        if (!states[topo][year]) states[topo][year] = {};
        states[topo][year][metricName] = metric;
      }
    }
  }

  const sortedYears = [...allYears].filter((y) => y >= MIN_YEAR).sort();
  const latestYear = sortedYears[sortedYears.length - 1] || 2023;

  // Metrics that are already rates/percentages — use absolute (pp) difference, not % change
  const PP_METRICS = new Set(["unemployment", "inflation"]);

  // Compute YoY changes
  const cacheStates: Record<string, unknown> = {};
  for (const topo of uniqueNames) {
    const years: Record<number, Record<string, unknown>> = {};
    for (const year of sortedYears) {
      const yearData = states[topo][year];
      if (!yearData) continue;
      const entry: Record<string, unknown> = {};
      for (const metricName of Object.keys(ALL_METRICS)) {
        const current = yearData[metricName];
        if (!current) continue;
        const prev = states[topo][year - 1]?.[metricName];
        let change: number | undefined;
        if (prev) {
          if (PP_METRICS.has(metricName)) {
            change = current.value - prev.value;
          } else if (prev.value !== 0) {
            change = ((current.value - prev.value) / prev.value) * 100;
          }
        }
        entry[metricName] = { value: current.value, year, change };
      }
      if (Object.keys(entry).length > 0) {
        years[year] = entry;
      }
    }

    const apiName = Object.entries(STATES_MAP).find(([, v]) => v === topo)?.[0] || topo;
    cacheStates[topo] = {
      apiName,
      topoName: topo,
      years,
      latestYear,
    };
  }

  // Compute national aggregates
  const nationalYears: Record<number, Record<string, unknown>> = {};

  // Collect all years including national-only metrics
  for (const store of Object.values(NATIONAL_ONLY)) {
    for (const yearStr of Object.keys(store)) allYears.add(parseInt(yearStr));
  }
  const allSortedYears = [...allYears].filter((y) => y >= MIN_YEAR).sort();

  for (const year of allSortedYears) {
    const entry: Record<string, unknown> = {};
    // Sum metrics (absolute counts)
    for (const metric of ["population", "crime", "gdp", "organPledges", "healthScreenings", "bloodDonations", "drugAddicts", "vehicleReg", "motorcycleReg", "schools", "enrolment", "teachers"]) {
      let total = 0;
      let count = 0;
      for (const topo of uniqueNames) {
        const val = states[topo][year]?.[metric];
        if (val) { total += val.value; count++; }
      }
      if (count > 0) entry[metric] = { value: total, year };
    }
    // Average for rate/index metrics
    for (const metric of ["unemployment", "cpi", "householdIncome", "gdpPerCapita", "crimeRate", "homicideRate", "doctorsPerCapita", "bedsPerCapita", "deathRate", "birthRate", "completion", "literacy", "studentTeacherRatio"]) {
      let total = 0;
      let count = 0;
      for (const topo of uniqueNames) {
        const val = states[topo][year]?.[metric];
        if (val) { total += val.value; count++; }
      }
      if (count > 0) entry[metric] = { value: total / count, year };
    }
    // National-only metrics
    for (const [metricName, store] of Object.entries(NATIONAL_ONLY)) {
      const m = store[year];
      if (m) {
        // Compute YoY change for national-only metrics
        const prev = store[year - 1];
        let change: number | undefined;
        if (prev) {
          if (PP_METRICS.has(metricName)) {
            change = m.value - prev.value;
          } else if (prev.value !== 0) {
            change = ((m.value - prev.value) / prev.value) * 100;
          }
        }
        entry[metricName] = { value: m.value, year, change };
      }
    }
    if (Object.keys(entry).length > 0) nationalYears[year] = entry;
  }

  // Compute YoY changes for national aggregates (state-derived metrics)
  for (const year of allSortedYears) {
    const entry = nationalYears[year];
    if (!entry) continue;
    const prevEntry = nationalYears[year - 1] as Record<string, { value: number }> | undefined;
    if (!prevEntry) continue;
    for (const metricName of ["population", "crime", "crimeRate", "gdp", "gdpPerCapita", "unemployment", "cpi", "householdIncome",
                              "organPledges", "healthScreenings", "bloodDonations", "doctorsPerCapita", "bedsPerCapita", "deathRate", "birthRate",
                              "drugAddicts", "homicideRate", "vehicleReg", "motorcycleReg", "schools", "enrolment", "teachers", "completion", "literacy", "studentTeacherRatio"]) {
      const current = entry[metricName] as { value: number; year: number; change?: number } | undefined;
      const prev = prevEntry[metricName];
      if (current && prev) {
        if (PP_METRICS.has(metricName)) {
          current.change = current.value - prev.value;
        } else if (prev.value !== 0) {
          current.change = ((current.value - prev.value) / prev.value) * 100;
        }
      }
    }
  }

  const cache = {
    fetchedAt: new Date().toISOString(),
    states: cacheStates,
    national: {
      apiName: "Malaysia",
      topoName: "Malaysia",
      years: nationalYears,
      latestYear,
    },
    availableYears: allSortedYears,
    /** GDP sector breakdown per state per year */
    gdpSectors,
    crimeBreakdown,
    bloodGroups,
    enrolmentBreakdown,
    ridership,
  };

  // Merge with existing cache for skipped tiers
  if (existingCache) {
    // Preserve state year data from skipped tiers
    const existingStates = (existingCache as { states: Record<string, { years: Record<number, Record<string, unknown>> }> }).states;
    for (const [topo, stateCache] of Object.entries(cache.states as Record<string, { years: Record<number, Record<string, unknown>> }>)) {
      const existing = existingStates?.[topo]?.years;
      if (!existing) continue;
      for (const [yearStr, yearData] of Object.entries(existing)) {
        const year = parseInt(yearStr);
        if (!stateCache.years[year]) stateCache.years[year] = {};
        // For each metric in existing, keep it if the new cache doesn't have it
        for (const [metric, val] of Object.entries(yearData)) {
          if (!stateCache.years[year][metric]) {
            stateCache.years[year][metric] = val;
          }
        }
      }
    }
    // Preserve national year data from skipped tiers
    const existingNational = (existingCache as { national: { years: Record<number, Record<string, unknown>> } }).national;
    if (existingNational?.years) {
      const natYears = (cache.national as { years: Record<number, Record<string, unknown>> }).years;
      for (const [yearStr, yearData] of Object.entries(existingNational.years)) {
        const year = parseInt(yearStr);
        if (!natYears[year]) natYears[year] = {};
        for (const [metric, val] of Object.entries(yearData as Record<string, unknown>)) {
          if (!natYears[year][metric]) natYears[year][metric] = val;
        }
      }
    }
    // Preserve breakdown data from existing if not re-fetched
    if (!fetchAnnual) {
      const ec = existingCache as Record<string, unknown>;
      if (ec.gdpSectors) cache.gdpSectors = ec.gdpSectors as typeof cache.gdpSectors;
      if (ec.crimeBreakdown) cache.crimeBreakdown = ec.crimeBreakdown as typeof cache.crimeBreakdown;
      if (ec.enrolmentBreakdown) cache.enrolmentBreakdown = ec.enrolmentBreakdown as typeof cache.enrolmentBreakdown;
    }
    if (!fetchDaily) {
      const ec = existingCache as Record<string, unknown>;
      if (ec.bloodGroups) cache.bloodGroups = ec.bloodGroups as typeof cache.bloodGroups;
      if (ec.ridership) cache.ridership = ec.ridership as typeof cache.ridership;
    }
  }

  // Write cache
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  console.log(`\nCache written to ${cachePath}`);

  // Save tier metadata
  saveTierMeta(tierMeta);

  // Data gap validation
  console.log("\nValidating data coverage...");
  const gaps: Array<{ state: string; metric: string; years: number[] }> = [];
  const metrics = Object.keys(ALL_METRICS);

  for (const topo of uniqueNames) {
    for (const metric of metrics) {
      const missingYears = allSortedYears.filter(
        (y) => !states[topo][y]?.[metric]
      );
      if (missingYears.length > 0 && missingYears.length < allSortedYears.length) {
        gaps.push({ state: topo, metric, years: missingYears });
      }
    }
  }

  const gapsData = { fetchedAt: new Date().toISOString(), gaps };
  const gapsPath = join(CACHE_DIR, "data-gaps.json");
  writeFileSync(gapsPath, JSON.stringify(gapsData, null, 2));

  // Summary
  console.log(`\nSUMMARY`);
  console.log(`  States: ${uniqueNames.length}`);
  console.log(`  Years: ${allSortedYears[0]}-${allSortedYears[allSortedYears.length - 1]} (${allSortedYears.length} years)`);
  console.log(`  Data gaps: ${gaps.length}`);
  if (gaps.length > 0) {
    console.log(`  Gap details:`);
    for (const gap of gaps.slice(0, 20)) {
      console.log(`    ${gap.state} / ${gap.metric}: missing ${gap.years.length} years`);
    }
    if (gaps.length > 20) console.log(`    ... and ${gaps.length - 20} more`);
  }
  console.log("\nDone.");
}

main().catch(console.error);

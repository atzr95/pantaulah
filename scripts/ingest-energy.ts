/**
 * Energy & Water data ingest for Pantaulah.
 *
 * Sources:
 *   - MyEnergyStats API (myenergystats.st.gov.my) — no auth needed for data queries
 *     - Electricity consumption by state (11 Peninsular states)
 *     - Electricity generation by region & fuel type
 *     - Installed capacity by region
 *   - data.gov.my — water data
 *     - Water consumption by state & sector
 *     - Water production by state
 *     - Access to treated water by state
 *
 * Run: npx tsx scripts/ingest-energy.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ENERGY_API = "https://myenergystats.st.gov.my/o/myenergystatsapi/energystats/aggregated-reports/topicSubTopic";
const WATER_API = "https://api.data.gov.my/data-catalogue";
const CACHE_DIR = join(process.cwd(), "src", "lib", "data", "cache");
const START_YEAR = 2015;
const END_YEAR = 2026;
const DELAY_MS = 2000; // MyEnergyStats is fast, but be polite

// ── State codes for electricity consumption ────────────

interface StateMapping {
  code: string; // MyEnergyStats subtopic code suffix
  apiName: string; // Name in the API response
  topoName: string; // TopoJSON name used in the dashboard
}

const PENINSULAR_STATES: StateMapping[] = [
  { code: "PRLS", apiName: "Perlis", topoName: "Perlis" },
  { code: "KDH", apiName: "Kedah", topoName: "Kedah" },
  { code: "PP", apiName: "Pulau Pinang", topoName: "Penang" },
  { code: "PRK", apiName: "Perak", topoName: "Perak" },
  { code: "SLGR", apiName: "Selangor", topoName: "Selangor" }, // includes KL + Putrajaya
  { code: "NS", apiName: "Negeri Sembilan", topoName: "Negeri Sembilan" },
  { code: "MLK", apiName: "Melaka", topoName: "Melaka" },
  { code: "JHR", apiName: "Johor", topoName: "Johor" },
  { code: "PHG", apiName: "Pahang", topoName: "Pahang" },
  { code: "TRG", apiName: "Terengganu", topoName: "Terengganu" },
  { code: "KLN", apiName: "Kelantan", topoName: "Kelantan" },
];

const CONSUMPTION_SECTORS = [
  { code: "DOME", description: "Domestic" },
  { code: "COMM", description: "Commercial" },
  { code: "IND", description: "Industrial" },
  { code: "MNG", description: "Mining" },
  { code: "PL", description: "Public Lighting" },
  { code: "AGR", description: "Agriculture" },
];

const FUEL_TYPES = [
  { code: "CC", description: "Coal" },
  { code: "NG", description: "Natural Gas" },
  { code: "DIE", description: "Diesel/MFO/Distillate" },
  { code: "HYD", description: "Hydro" },
  { code: "BMAS", description: "Biomass" },
  { code: "BGAS", description: "Biogas" },
  { code: "SLR", description: "Solar" },
  { code: "OTH", description: "Others" },
];

const REGIONS = [
  { code: "PEN", description: "Peninsular" },
  { code: "SBH", description: "Sabah" },
  { code: "SWK", description: "Sarawak" },
];

// Water state name → topoName mapping
const WATER_STATES_MAP: Record<string, string> = {
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

// ── Helpers ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEnergyAPI(payload: object): Promise<any[]> {
  try {
    const res = await fetch(ENERGY_API, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`  Energy API HTTP ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error(`  Energy API error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchWaterAPI(id: string): Promise<any[]> {
  const url = `${WATER_API}/?id=${id}&limit=2000`; // trailing slash required — 301 without it
  console.log(`  Fetching water data: ${id}...`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      console.error(`  Water API HTTP ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error(`  Water API error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ── Cache types ────────────────────────────────────────

interface EnergyCacheData {
  fetchedAt: string;

  /** Electricity consumption by state, year, sector (GWh) — 11 Peninsular states */
  electricityConsumption: Record<string, Record<number, {
    total: number;
    domestic: number;
    commercial: number;
    industrial: number;
    mining: number;
    publicLighting: number;
    agriculture: number;
  }>>;

  /** Total electricity consumption per state per year (for choropleth) */
  electricityTotal: Record<string, Record<number, { value: number; year: number; change?: number }>>;

  /** Electricity generation by region per year (GWh) */
  generationByRegion: Record<string, Record<number, number>>;

  /** National electricity consumption by sector per year (ktoe) */
  nationalConsumptionBySector: Record<number, Record<string, number>>;

  /** Electricity generation by fuel type per year (GWh) — national */
  generationByFuel: Record<number, Record<string, number>>;

  /** Installed capacity by region per year (MW) */
  capacityByRegion: Record<string, Record<number, number>>;

  /** Water consumption by state per year (MLD) */
  waterConsumption: Record<string, Record<number, { domestic: number; nonDomestic: number; total: number }>>;

  /** Water production by state per year (MLD) */
  waterProduction: Record<string, Record<number, number>>;

  /** Access to treated water by state per year (%) */
  waterAccess: Record<string, Record<number, number>>;

  /** Available years */
  availableYears: number[];
}

// ── Fetch electricity consumption by state ─────────────

async function fetchStateConsumption(): Promise<EnergyCacheData["electricityConsumption"]> {
  console.log("\n[1/6] Fetching electricity consumption by state...");
  const result: EnergyCacheData["electricityConsumption"] = {};

  for (const state of PENINSULAR_STATES) {
    console.log(`  → ${state.apiName} (TSESS_${state.code})...`);
    const data = await fetchEnergyAPI({
      topic: { code: "ELECT", type: "ENERGY" },
      startYear: START_YEAR,
      endYear: END_YEAR,
      subTopicCode: `TSESS_${state.code}`,
      subTopic: {
        code: `TSESS_${state.code}`,
        description: state.apiName,
        fields: [
          {
            key: state.code,
            fieldName: state.apiName,
            code: { code: `TSESS_${state.code}` },
            selectValues: CONSUMPTION_SECTORS,
          },
          {
            key: "FINAL-ENERGY-CONSUMPTION-BY-SECTORS",
            fieldName: "Final Energy Consumption by Sectors",
            fieldUnit: "GWh",
            decimalPoint: 2,
          },
        ],
        unit: "GWh",
      },
    });

    if (!data.length) {
      console.log(`    No data returned`);
      continue;
    }

    const stateData: Record<number, Record<string, number>> = {};
    for (const row of data) {
      const year = row.year;
      if (!stateData[year]) stateData[year] = {};
      const sectorCode = Object.values(row.data)[0] as { code: string; description: string };
      const value = (Object.values(row.data)[1] as { value: number }).value;
      stateData[year][sectorCode.code] = value;
    }

    result[state.topoName] = {};
    for (const [yearStr, sectors] of Object.entries(stateData)) {
      const year = Number(yearStr);
      result[state.topoName][year] = {
        total: Object.values(sectors).reduce((s, v) => s + v, 0),
        domestic: sectors["DOME"] ?? 0,
        commercial: sectors["COMM"] ?? 0,
        industrial: sectors["IND"] ?? 0,
        mining: sectors["MNG"] ?? 0,
        publicLighting: sectors["PL"] ?? 0,
        agriculture: sectors["AGR"] ?? 0,
      };
    }

    console.log(`    ${Object.keys(stateData).length} years`);
    await sleep(DELAY_MS);
  }

  return result;
}

// ── Fetch generation by region ─────────────────────────

async function fetchGenerationByRegion(): Promise<EnergyCacheData["generationByRegion"]> {
  console.log("\n[2/6] Fetching electricity generation by region...");
  const data = await fetchEnergyAPI({
    topic: { code: "ELECT", type: "ENERGY" },
    startYear: START_YEAR,
    endYear: END_YEAR,
    subTopicCode: "ELCTGEN_REG",
    subTopic: {
      code: "ELCTGEN_REG",
      description: "Region",
      fields: [
        {
          key: "REGION",
          fieldName: "Region",
          code: { code: "ELCTGEN_REG" },
          selectValues: REGIONS,
        },
        {
          key: "ELECTRICITY-GENERATION",
          fieldName: "Electricity Generation",
          fieldUnit: "GWh",
          decimalPoint: 2,
        },
      ],
      unit: "GWh",
    },
  });

  const result: EnergyCacheData["generationByRegion"] = {};
  for (const row of data) {
    const region = (row.data["REGION"] as { description: string }).description;
    const value = (row.data["ELECTRICITY-GENERATION"] as { value: number }).value;
    if (!result[region]) result[region] = {};
    result[region][row.year] = value;
  }

  console.log(`  ${data.length} records, ${Object.keys(result).length} regions`);
  return result;
}

// ── Fetch generation by fuel type ──────────────────────

async function fetchGenerationByFuel(): Promise<EnergyCacheData["generationByFuel"]> {
  console.log("\n[3/6] Fetching electricity generation by fuel type...");
  const data = await fetchEnergyAPI({
    topic: { code: "ELECT", type: "ENERGY" },
    startYear: START_YEAR,
    endYear: END_YEAR,
    subTopicCode: "ELCTGEN_FUELTYP",
    subTopic: {
      code: "ELCTGEN_FUELTYP",
      description: "Fuel Types",
      fields: [
        {
          key: "FUEL-TYPES",
          fieldName: "Fuel Types",
          code: { code: "ELCTGEN_FUELTYP" },
          selectValues: FUEL_TYPES,
        },
        {
          key: "ELECTRICITY-GENERATION",
          fieldName: "Electricity Generation",
          fieldUnit: "GWh",
          decimalPoint: 2,
        },
      ],
      unit: "GWh",
    },
  });

  const result: EnergyCacheData["generationByFuel"] = {};
  for (const row of data) {
    const fuel = (row.data["FUEL-TYPES"] as { description: string }).description;
    const value = (row.data["ELECTRICITY-GENERATION"] as { value: number }).value;
    if (!result[row.year]) result[row.year] = {};
    result[row.year][fuel] = value;
  }

  console.log(`  ${data.length} records, ${Object.keys(result).length} years`);
  return result;
}

// ── Fetch installed capacity by region ─────────────────

async function fetchCapacityByRegion(): Promise<EnergyCacheData["capacityByRegion"]> {
  console.log("\n[4/6] Fetching installed capacity by region...");
  const data = await fetchEnergyAPI({
    topic: { code: "ELECT", type: "ENERGY" },
    startYear: START_YEAR,
    endYear: END_YEAR,
    subTopicCode: "INSCPCT_REG",
    subTopic: {
      code: "INSCPCT_REG",
      description: "Region",
      fields: [
        {
          key: "REGION",
          fieldName: "Region",
          code: { code: "INSCPCT_REG" },
          selectValues: REGIONS,
        },
        {
          key: "INSTALLED-CAPACITY",
          fieldName: "Installed Capacity",
          fieldUnit: "MW",
          decimalPoint: 2,
        },
      ],
      unit: "MW",
    },
  });

  const result: EnergyCacheData["capacityByRegion"] = {};
  for (const row of data) {
    const region = (row.data["REGION"] as { description: string }).description;
    const vals = Object.values(row.data) as Array<{ value?: number }>;
    const value = vals.find((v) => v.value != null)?.value ?? 0;
    if (!result[region]) result[region] = {};
    result[region][row.year] = value;
  }

  console.log(`  ${data.length} records`);
  return result;
}

// ── Fetch national consumption by sector ───────────────

async function fetchNationalConsumptionBySector(): Promise<EnergyCacheData["nationalConsumptionBySector"]> {
  console.log("\n[5/7] Fetching national electricity consumption by sector...");
  const data = await fetchEnergyAPI({
    topic: { code: "ELECT", type: "ENERGY" },
    startYear: START_YEAR,
    endYear: END_YEAR,
    subTopicCode: "CNSMP_TOTAL",
    subTopic: {
      code: "CNSMP_TOTAL",
      description: "Total",
      fields: [
        {
          key: "TOTAL",
          fieldName: "Total",
          code: { code: "TOTAL" },
          selectValues: [
            { code: "RES", description: "Residential" },
            { code: "COMM", description: "Commercial" },
            { code: "IND", description: "Industrial" },
            { code: "TRSPRT", description: "Transport" },
            { code: "AGR", description: "Agriculture" },
          ],
        },
        {
          key: "FINAL-ENERGY-CONSUMPTION-BY-SECTORS",
          fieldName: "Final Energy Consumption by Sectors",
          fieldUnit: "ktoe",
          decimalPoint: 2,
        },
      ],
      unit: "ktoe",
    },
  });

  const KTOE_TO_GWH = 11.63; // 1 ktoe = 11.63 GWh
  const result: EnergyCacheData["nationalConsumptionBySector"] = {};
  for (const row of data) {
    const sector = (Object.values(row.data)[0] as { description: string }).description;
    const ktoe = (Object.values(row.data)[1] as { value: number }).value;
    if (!result[row.year]) result[row.year] = {};
    result[row.year][sector] = Math.round(ktoe * KTOE_TO_GWH * 100) / 100; // convert to GWh
  }

  console.log(`  ${data.length} records, ${Object.keys(result).length} years`);
  return result;
}

// ── Fetch water data ───────────────────────────────────

async function fetchWaterData(): Promise<{
  consumption: EnergyCacheData["waterConsumption"];
  production: EnergyCacheData["waterProduction"];
  access: EnergyCacheData["waterAccess"];
}> {
  console.log("\n[6/7] Fetching water data from data.gov.my...");

  // Water consumption
  const consumptionRaw = await fetchWaterAPI("water_consumption");
  await sleep(DELAY_MS);
  const consumption: EnergyCacheData["waterConsumption"] = {};
  for (const row of consumptionRaw) {
    const state = WATER_STATES_MAP[row.state];
    if (!state || row.state === "Malaysia") continue;
    const year = new Date(row.date).getFullYear();
    if (year < START_YEAR) continue;
    if (!consumption[state]) consumption[state] = {};
    if (!consumption[state][year]) consumption[state][year] = { domestic: 0, nonDomestic: 0, total: 0 };
    const val = Number(row.value) || 0; // API field is 'value', not 'consumption'
    if (row.sector === "domestic") {
      consumption[state][year].domestic = val;
    } else {
      consumption[state][year].nonDomestic = val;
    }
    consumption[state][year].total = consumption[state][year].domestic + consumption[state][year].nonDomestic;
  }
  console.log(`  Water consumption: ${Object.keys(consumption).length} states`);

  // Water production
  const productionRaw = await fetchWaterAPI("water_production");
  await sleep(DELAY_MS);
  const production: EnergyCacheData["waterProduction"] = {};
  for (const row of productionRaw) {
    const state = WATER_STATES_MAP[row.state];
    if (!state || row.state === "Malaysia") continue;
    const year = new Date(row.date).getFullYear();
    if (year < START_YEAR) continue;
    if (!production[state]) production[state] = {};
    production[state][year] = Number(row.value) || 0;
  }
  console.log(`  Water production: ${Object.keys(production).length} states`);

  // Water access
  const accessRaw = await fetchWaterAPI("water_access");
  const access: EnergyCacheData["waterAccess"] = {};
  for (const row of accessRaw) {
    const state = WATER_STATES_MAP[row.state];
    if (!state || row.state === "Malaysia") continue;
    if (row.strata !== "overall") continue;
    const year = new Date(row.date).getFullYear();
    if (year < START_YEAR) continue;
    if (!access[state]) access[state] = {};
    access[state][year] = Number(row.proportion) || 0; // field is 'proportion', not 'value'
  }
  console.log(`  Water access: ${Object.keys(access).length} states`);

  return { consumption, production, access };
}

// ── Compute totals for choropleth ──────────────────────

function computeElectricityTotals(
  consumption: EnergyCacheData["electricityConsumption"]
): EnergyCacheData["electricityTotal"] {
  const result: EnergyCacheData["electricityTotal"] = {};

  for (const [state, years] of Object.entries(consumption)) {
    result[state] = {};
    const sortedYears = Object.keys(years).map(Number).sort();

    for (const year of sortedYears) {
      const total = years[year].total;
      const prevYear = years[year - 1]?.total;
      const change = prevYear ? ((total - prevYear) / prevYear) * 100 : undefined;
      result[state][year] = { value: Math.round(total * 100) / 100, year, change };
    }
  }

  return result;
}

// ── Main ───────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  PANTAULAH — Energy & Water Data Ingest   ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const consumption = await fetchStateConsumption();
  await sleep(DELAY_MS);

  const generationByRegion = await fetchGenerationByRegion();
  await sleep(DELAY_MS);

  const generationByFuel = await fetchGenerationByFuel();
  await sleep(DELAY_MS);

  const capacityByRegion = await fetchCapacityByRegion();
  await sleep(DELAY_MS);

  const nationalConsumptionBySector = await fetchNationalConsumptionBySector();
  await sleep(DELAY_MS);

  const { consumption: waterConsumption, production: waterProduction, access: waterAccess } = await fetchWaterData();

  const electricityTotal = computeElectricityTotals(consumption);

  // Collect all available years
  const allYears = new Set<number>();
  for (const stateYears of Object.values(consumption)) {
    for (const y of Object.keys(stateYears)) allYears.add(Number(y));
  }
  for (const regionYears of Object.values(generationByRegion)) {
    for (const y of Object.keys(regionYears)) allYears.add(Number(y));
  }

  const cache: EnergyCacheData = {
    fetchedAt: new Date().toISOString(),
    electricityConsumption: consumption,
    electricityTotal,
    nationalConsumptionBySector,
    generationByRegion,
    generationByFuel,
    capacityByRegion,
    waterConsumption,
    waterProduction,
    waterAccess,
    availableYears: [...allYears].sort(),
  };

  const outPath = join(CACHE_DIR, "energy-data.json");
  writeFileSync(outPath, JSON.stringify(cache, null, 2));

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║               INGEST COMPLETE              ║");
  console.log("╚═══════════════════════════════════════════╝");
  console.log(`\n  Output: ${outPath}`);
  console.log(`  Electricity states: ${Object.keys(consumption).length}`);
  console.log(`  Water states: ${Object.keys(waterConsumption).length}`);
  console.log(`  Years: ${cache.availableYears.join(", ")}`);
  console.log(`  Size: ${(JSON.stringify(cache).length / 1024).toFixed(1)} KB\n`);
}

main().catch(console.error);

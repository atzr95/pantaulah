/**
 * Fetcher for data.gov.my Weather API (primary source).
 * Docs: https://developer.data.gov.my/realtime-api/weather
 *
 * Covers: 7-day forecast, weather warnings, earthquake warnings.
 * Air quality: Open-Meteo Air Quality API (free, no key).
 * Marine forecast: not available without MET token.
 *
 * ── Backup: MET Malaysia API (api.met.gov.my v2.1) ──────────
 * Requires METToken (registration at api.met.gov.my).
 *
 *   const MET_TOKEN = process.env.MET_MALAYSIA_TOKEN;
 *   const BASE = "https://api.met.gov.my/v2.1";
 *   const headers = { Authorization: `METToken ${MET_TOKEN}` };
 *
 *   // General forecast
 *   fetch(`${BASE}/data?datasetid=FORECAST&datacategoryid=GENERAL&...`, { headers })
 *
 *   // Warnings
 *   fetch(`${BASE}/data?datasetid=WARNING&datacategoryid=THUNDERSTORM&...`, { headers })
 *
 *   // Marine forecast
 *   fetch(`${BASE}/data?datasetid=FORECAST&datacategoryid=MARINE&...`, { headers })
 */

import type {
  ForecastEntry,
  WarningEntry,
  WarningCategory,
  WarningSeverity,
  EarthquakeEntry,
  AirQualityData,
  AirQualityReading,
} from "./weather-types";
import { STATE_COORDINATES, getAirQualityStatus } from "./weather-types";

const BASE = "https://api.data.gov.my";

// ── Raw response types from data.gov.my ────────────────────

interface RawForecast {
  location: {
    location_id: string;
    location_name: string;
  };
  date: string;
  morning_forecast: string;
  afternoon_forecast: string;
  night_forecast: string;
  summary_forecast: string;
  summary_when?: string;
  min_temp: number;
  max_temp: number;
}

interface RawWarning {
  warning_issue: {
    issued: string;
    title_bm: string;
    title_en: string;
  };
  valid_from: string;
  valid_to: string;
  heading_en: string;
  text_en: string;
  instruction_en: string | null;
  heading_bm: string;
  text_bm: string;
  instruction_bm: string | null;
}

interface RawEarthquake {
  utcdatetime: string;
  localdatetime: string;
  lat: number;
  lon: number;
  depth: number;
  location: string;
  location_original: string;
  magdefault: number;
  magtypedefault: string;
  status: string;
  visible: boolean;
}

// ── Malay → English forecast translation ───────────────────

const FORECAST_TRANSLATIONS: Record<string, string> = {
  "Tiada hujan": "No rain",
  "Ribut petir": "Thunderstorms",
  "Ribut petir di beberapa tempat": "Thunderstorms in some areas",
  "Ribut petir di beberapa tempat di kawasan pedalaman":
    "Isolated thunderstorms in inland areas",
  "Ribut petir di satu dua tempat": "Isolated thunderstorms",
  "Hujan di beberapa tempat": "Rain in some areas",
  "Hujan di satu dua tempat": "Isolated rain",
  "Hujan lebat di beberapa tempat": "Heavy rain in some areas",
  "Hujan lebat": "Heavy rain",
  "Hujan": "Rain",
  "Mendung": "Cloudy",
  "Cerah": "Fair",
  "Jerebu": "Hazy",
  "Berjerebu": "Hazy",
};

function translateForecast(malay: string): string {
  // Exact match first
  if (FORECAST_TRANSLATIONS[malay]) return FORECAST_TRANSLATIONS[malay];
  // Partial match — find the longest matching key
  for (const [key, value] of Object.entries(FORECAST_TRANSLATIONS).sort(
    (a, b) => b[0].length - a[0].length
  )) {
    if (malay.toLowerCase().includes(key.toLowerCase())) return value;
  }
  // No match — return original
  return malay;
}

// ── State name normalisation ───────────────────────────────

const STATE_NAME_MAP: Record<string, string> = {
  "Pulau Pinang": "Penang",
  "W.P. Kuala Lumpur": "Kuala Lumpur",
  "W.P. Putrajaya": "Putrajaya",
  "W.P. Labuan": "Labuan",
};

function normaliseStateName(name: string): string {
  return STATE_NAME_MAP[name] ?? name;
}

// ── Warning category & severity inference ──────────────────

function inferCategory(titleEn: string): WarningCategory {
  const t = titleEn.toLowerCase();
  if (t.includes("thunderstorm")) return "THUNDERSTORM";
  if (t.includes("rain")) return "RAIN";
  if (t.includes("wind") || t.includes("sea") || t.includes("wave"))
    return "WINDSEA";
  if (t.includes("cyclone") || t.includes("typhoon")) return "CYCLONE";
  if (t.includes("earthquake") || t.includes("tsunami"))
    return "QUAKETSUNAMI";
  return "THUNDERSTORM"; // default
}

function inferSeverity(titleEn: string): WarningSeverity {
  const t = titleEn.toLowerCase();
  if (t.includes("danger")) return "DANGER";
  if (t.includes("advisory")) return "ADVISORY";
  return "WARNING";
}

// ── Malaysian states list (for extracting affected areas) ──

const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Penang",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Putrajaya",
  "Labuan",
];

function extractAffectedAreas(textEn: string): string[] {
  const areas: string[] = [];
  for (const state of MALAYSIAN_STATES) {
    if (textEn.includes(state)) {
      areas.push(normaliseStateName(state));
    }
  }
  return [...new Set(areas)];
}

// ── Fetchers ───────────────────────────────────────────────

export async function fetchForecasts(): Promise<ForecastEntry[]> {
  // Fetch state-level forecasts (prefix St = state)
  // Trailing slash required — API returns 301 without it
  const res = await fetch(
    `${BASE}/weather/forecast/?contains=St@location__location_id`,
    { next: { revalidate: 1800 } } // cache 30 min
  );
  if (!res.ok) throw new Error(`data.gov.my forecast: ${res.status}`);

  const raw: RawForecast[] = await res.json();

  return raw.map((r) => ({
    location: {
      locationId: r.location.location_id,
      locationName: normaliseStateName(r.location.location_name),
      state: normaliseStateName(r.location.location_name),
    },
    date: r.date,
    morningForecast: translateForecast(r.morning_forecast),
    afternoonForecast: translateForecast(r.afternoon_forecast),
    nightForecast: translateForecast(r.night_forecast),
    summaryForecast: translateForecast(r.summary_forecast),
    minTemp: r.min_temp,
    maxTemp: r.max_temp,
  }));
}

export async function fetchWarnings(): Promise<WarningEntry[]> {
  const res = await fetch(`${BASE}/weather/warning/`, {
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!res.ok) throw new Error(`data.gov.my warning: ${res.status}`);

  const raw: RawWarning[] = await res.json();

  return raw.map((r, i) => ({
    id: `DGMY-W${String(i + 1).padStart(3, "0")}`,
    category: inferCategory(r.warning_issue.title_en),
    severity: inferSeverity(r.warning_issue.title_en),
    title: r.warning_issue.title_en,
    titleBm: r.warning_issue.title_bm,
    heading: r.heading_en,
    text: r.text_en,
    textBm: r.text_bm,
    instruction: r.instruction_en,
    issuedAt: r.warning_issue.issued,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    affectedAreas: extractAffectedAreas(r.text_en),
  }));
}

export async function fetchEarthquakes(): Promise<EarthquakeEntry[]> {
  // data.gov.my — sort by newest first (default sort returns oldest)
  const res = await fetch(
    `${BASE}/weather/warning/earthquake/?limit=10&sort=-utcdatetime`,
    { next: { revalidate: 300 } } // cache 5 min
  );
  if (!res.ok) throw new Error(`data.gov.my earthquake: ${res.status}`);

  const raw: RawEarthquake[] = await res.json();

  return raw
    .filter((r) => r.visible)
    .map((r) => ({
      datetime: r.localdatetime,
      utcDatetime: r.utcdatetime,
      lat: r.lat,
      lon: r.lon,
      depth: r.depth,
      magnitude: r.magdefault,
      magnitudeType: r.magtypedefault,
      location: r.location_original || r.location,
      status: r.status === "FELT"
        ? "FELT"
        : r.status === "TSUNAMI_WARNING"
          ? "TSUNAMI_WARNING"
          : "NORMAL",
    }));
}

// ── Air Quality (Open-Meteo) ───────────────────────────────

const AQ_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const AQ_PARAMS = "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,us_aqi";

export async function fetchAirQuality(): Promise<AirQualityData> {
  const now = new Date().toISOString();

  // Batch all 16 stations into a single Open-Meteo request
  const lats = STATE_COORDINATES.map((c) => c.lat).join(",");
  const lons = STATE_COORDINATES.map((c) => c.lon).join(",");
  const url = `${AQ_BASE}?latitude=${lats}&longitude=${lons}&current=${AQ_PARAMS}&timezone=Asia/Kuala_Lumpur`;

  const res = await fetch(url, { next: { revalidate: 900 } }); // cache 15 min
  if (!res.ok) throw new Error(`Open-Meteo AQ: ${res.status}`);

  const data = await res.json();
  // Single coord returns object, multiple returns array
  const items: Array<{ current: Record<string, number> }> = Array.isArray(data)
    ? data
    : [data];

  const readings: AirQualityReading[] = [];
  for (let i = 0; i < items.length && i < STATE_COORDINATES.length; i++) {
    const c = items[i].current;
    if (!c) continue;
    const coord = STATE_COORDINATES[i];

    const pollutants = [
      { name: "PM2.5", value: c.pm2_5 },
      { name: "PM10", value: c.pm10 },
      { name: "O3", value: c.ozone },
    ];
    const dominant = pollutants.sort((a, b) => b.value - a.value)[0];

    readings.push({
      state: coord.state,
      stationName: coord.locationName,
      apiValue: c.us_aqi ?? 0,
      status: getAirQualityStatus(c.us_aqi ?? 0),
      dominantPollutant: dominant.name,
      pm25: Math.round(c.pm2_5 ?? 0),
      pm10: Math.round(c.pm10 ?? 0),
      o3: Math.round(c.ozone ?? 0),
      co: Math.round(((c.carbon_monoxide ?? 0) / 1000) * 10) / 10,
      so2: Math.round(c.sulphur_dioxide ?? 0),
      no2: Math.round(c.nitrogen_dioxide ?? 0),
      updatedAt: now,
    });
  }

  return { readings, fetchedAt: now };
}

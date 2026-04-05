/**
 * TypeScript interfaces for MetMalaysia weather API (api.met.gov.my v2.1).
 * Covers: General Forecast, Warnings, Marine Forecast, Radar/Satellite, Earthquake.
 */

// ── General Forecast ────────────────────────────────────

export interface ForecastLocation {
  locationId: string; // e.g. "LOCATION:237"
  locationName: string; // e.g. "PUTRAJAYA"
  state: string; // parent state
}

export interface ForecastEntry {
  location: ForecastLocation;
  date: string; // ISO date
  morningForecast: string;
  afternoonForecast: string;
  nightForecast: string;
  summaryForecast: string;
  minTemp: number;
  maxTemp: number;
}

// ── Weather Warnings ────────────────────────────────────

export type WarningCategory =
  | "THUNDERSTORM"
  | "RAIN"
  | "WINDSEA"
  | "CYCLONE"
  | "QUAKETSUNAMI";

export type WarningSeverity = "ADVISORY" | "WARNING" | "DANGER";

export interface WarningEntry {
  id: string;
  category: WarningCategory;
  severity: WarningSeverity;
  title: string;
  titleBm: string;
  heading: string;
  text: string;
  textBm: string;
  instruction: string | null;
  issuedAt: string; // ISO datetime
  validFrom: string;
  validTo: string;
  affectedAreas: string[];
}

// ── Marine Forecast ─────────────────────────────────────

export interface MarineForecastEntry {
  locationId: string;
  locationName: string; // e.g. "Selat Melaka (Utara)"
  date: string;
  forecast: string;
  minWaveHeight: number; // metres
  maxWaveHeight: number;
  windSpeed: string; // e.g. "10-20 knots"
  windDirection: string; // e.g. "Southwesterly"
}

// ── Earthquake ──────────────────────────────────────────

export interface EarthquakeEntry {
  datetime: string; // local datetime
  utcDatetime: string;
  lat: number;
  lon: number;
  depth: number; // km
  magnitude: number;
  magnitudeType: string; // e.g. "mb"
  location: string;
  status: "NORMAL" | "FELT" | "TSUNAMI_WARNING";
}

// ── Radar / Satellite ───────────────────────────────────

export interface RadarImageSet {
  radar: string; // URL to radar image
  satellite: string; // URL to satellite image
  swirl: string; // URL to SWIRL nowcast
  updatedAt: string; // ISO datetime
}

// ── Live Current Weather (Open-Meteo) ───────────────────

export interface CurrentWeather {
  time: string; // ISO 8601 local time
  temperature: number; // °C
  apparentTemperature: number; // °C (feels like)
  humidity: number; // %
  windSpeed: number; // km/h
  windDirection: number; // degrees
  weatherCode: number; // WMO code
  precipitation: number; // mm
  pressure: number; // hPa
  uvIndex: number;
  cloudCover: number; // %
}

export interface CurrentWeatherResponse {
  state: string;
  locationName: string;
  current: CurrentWeather;
  fetchedAt: string;
}

// ── State Coordinates (for Open-Meteo lookups) ──────────

export interface StateCoordinate {
  state: string; // topoName
  locationName: string; // capital city
  lat: number;
  lon: number;
}

export const STATE_COORDINATES: StateCoordinate[] = [
  { state: "Johor", locationName: "Johor Bahru", lat: 1.4927, lon: 103.7414 },
  { state: "Kedah", locationName: "Alor Setar", lat: 6.1248, lon: 100.3677 },
  { state: "Kelantan", locationName: "Kota Bharu", lat: 6.1256, lon: 102.2385 },
  { state: "Melaka", locationName: "Melaka City", lat: 2.1896, lon: 102.2501 },
  { state: "Negeri Sembilan", locationName: "Seremban", lat: 2.7258, lon: 101.9424 },
  { state: "Pahang", locationName: "Kuantan", lat: 3.8077, lon: 103.326 },
  { state: "Perak", locationName: "Ipoh", lat: 4.5975, lon: 101.0901 },
  { state: "Perlis", locationName: "Kangar", lat: 6.4414, lon: 100.1986 },
  { state: "Penang", locationName: "George Town", lat: 5.4141, lon: 100.3288 },
  { state: "Sabah", locationName: "Kota Kinabalu", lat: 5.9804, lon: 116.0735 },
  { state: "Sarawak", locationName: "Kuching", lat: 1.5497, lon: 110.3634 },
  { state: "Selangor", locationName: "Shah Alam", lat: 3.0738, lon: 101.5183 },
  { state: "Terengganu", locationName: "Kuala Terengganu", lat: 5.3117, lon: 103.1324 },
  { state: "Kuala Lumpur", locationName: "Kuala Lumpur", lat: 3.139, lon: 101.6869 },
  { state: "Putrajaya", locationName: "Putrajaya", lat: 2.9264, lon: 101.6964 },
  { state: "Labuan", locationName: "Victoria", lat: 5.2831, lon: 115.2308 },
];

// ── Air Quality (APIMS) ─────────────────────────────────

export type AirQualityStatus =
  | "GOOD"
  | "MODERATE"
  | "UNHEALTHY"
  | "VERY_UNHEALTHY"
  | "HAZARDOUS";

export interface AirQualityReading {
  state: string;
  stationName: string;
  apiValue: number; // Air Pollutant Index (0-500+)
  status: AirQualityStatus;
  dominantPollutant: string; // e.g. "PM2.5", "PM10", "O3"
  pm25: number; // µg/m³
  pm10: number;
  o3: number; // ppb
  co: number; // ppm
  so2: number; // ppb
  no2: number; // ppb
  updatedAt: string;
}

export interface AirQualityData {
  readings: AirQualityReading[];
  fetchedAt: string;
}

export function getAirQualityStatus(api: number): AirQualityStatus {
  if (api <= 50) return "GOOD";
  if (api <= 100) return "MODERATE";
  if (api <= 200) return "UNHEALTHY";
  if (api <= 300) return "VERY_UNHEALTHY";
  return "HAZARDOUS";
}

export function getAirQualityColor(status: AirQualityStatus): string {
  switch (status) {
    case "GOOD": return "var(--color-green)";
    case "MODERATE": return "var(--color-cyan)";
    case "UNHEALTHY": return "var(--color-amber)";
    case "VERY_UNHEALTHY": return "var(--color-red)";
    case "HAZARDOUS": return "#8b5cf6";
  }
}

// ── Flood Alerts (JPS InfoBanjir) ──────────────────────────

export type FloodAlertLevel = "WASPADA" | "AMARAN" | "BAHAYA";

export interface FloodAlertStation {
  state: string; // normalized topoName (e.g. "Penang")
  stationName: string; // river / station name
  waterLevel: number; // current level in metres
  threshold: number; // threshold for this alert level
  alertLevel: FloodAlertLevel;
  trend: "RISING" | "STABLE" | "FALLING";
}

export interface FloodAlertData {
  stations: FloodAlertStation[];
  fetchedAt: string;
}

export function getFloodAlertSeverity(level: FloodAlertLevel): WarningSeverity {
  switch (level) {
    case "BAHAYA": return "DANGER";
    case "AMARAN": return "WARNING";
    case "WASPADA": return "ADVISORY";
  }
}

export function getFloodTrendIcon(trend: "RISING" | "STABLE" | "FALLING"): string {
  switch (trend) {
    case "RISING": return "\u2191";
    case "FALLING": return "\u2193";
    case "STABLE": return "\u2192";
  }
}

// ── Aggregated Weather Data ─────────────────────────────

export type WeatherSubTab =
  | "forecast"
  | "warnings"
  | "radar"
  | "marine";

export interface WeatherData {
  forecasts: ForecastEntry[];
  warnings: WarningEntry[];
  marineForecast: MarineForecastEntry[];
  earthquakes: EarthquakeEntry[];
  floodAlerts: FloodAlertData;
  radar: RadarImageSet;
  airQuality: AirQualityData;
  fetchedAt: string;
}

import { NextResponse } from "next/server";
import { cachedJson } from "@/lib/server/edge-cache";
import type { LiveGrid } from "@/lib/live/grid-field";

/**
 * Hourly weather + air-quality grid over Malaysia from Open-Meteo, for the
 * live map's wind particles, cloud blobs and smog blobs.
 *
 * One request per grid point counts against Open-Meteo's free quota, so we
 * fetch 24 hourly steps at once and cache for 3h — the client picks the hour.
 * 0.75° spacing keeps it under ~350 points per API.
 */

const LON0 = 99, LON1 = 120, LAT0 = 0, LAT1 = 8.25, STEP = 0.75;
const CHUNK = 100; // points per upstream request
const TTL = 3 * 3600;

function buildPoints() {
  const lons: number[] = [], lats: number[] = [];
  for (let x = LON0; x <= LON1; x += STEP) lons.push(+x.toFixed(2));
  for (let y = LAT0; y <= LAT1; y += STEP) lats.push(+y.toFixed(2));
  const pts: { lat: number; lon: number }[] = [];
  for (const lat of lats) for (const lon of lons) pts.push({ lat, lon });
  return { lons, lats, pts };
}

async function fetchChunked(
  base: string,
  pts: { lat: number; lon: number }[],
  params: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < pts.length; i += CHUNK) {
    const slice = pts.slice(i, i + CHUNK);
    const url =
      `${base}?latitude=${slice.map((p) => p.lat).join(",")}` +
      `&longitude=${slice.map((p) => p.lon).join(",")}&${params}&forecast_days=1&timezone=UTC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = await res.json();
    out.push(...(Array.isArray(json) ? json : [json]));
  }
  return out;
}

type Hourly = { time: string[] } & Record<string, (number | null)[]>;
const series = (rows: Record<string, unknown>[], key: string) =>
  rows.map((r) => ((r.hourly as Hourly)[key] ?? []).map((v) => (v == null ? 0 : Math.round(v * 10) / 10)));

async function buildGrid(): Promise<LiveGrid> {
  const { lons, lats, pts } = buildPoints();
  const [wx, aq] = await Promise.all([
    fetchChunked(
      "https://api.open-meteo.com/v1/forecast",
      pts,
      "hourly=wind_speed_10m,wind_direction_10m,cloud_cover"
    ),
    fetchChunked("https://air-quality-api.open-meteo.com/v1/air-quality", pts, "hourly=pm2_5"),
  ]);
  return {
    lons,
    lats,
    times: (wx[0].hourly as Hourly).time,
    windSpeed: series(wx, "wind_speed_10m"),
    windDir: series(wx, "wind_direction_10m"),
    cloud: series(wx, "cloud_cover"),
    pm25: series(aq, "pm2_5"),
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const grid = await cachedJson("live:grid", TTL, buildGrid);
    return NextResponse.json(grid, {
      headers: { "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "grid unavailable" }, { status: 502 });
  }
}

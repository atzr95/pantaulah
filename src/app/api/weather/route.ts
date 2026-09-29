import { NextResponse } from "next/server";


import {
  fetchForecasts,
  fetchWarnings,
  fetchEarthquakes,
  fetchAirQuality,
  fetchFloodAlerts,
} from "@/lib/data/data-gov-weather";
import type { WeatherData } from "@/lib/data/weather-types";
import { cachedJson } from "@/lib/server/edge-cache";

// Always run per request — the edge cache below controls actual freshness,
// so the handler must never be statically frozen at build time.
export const dynamic = "force-dynamic";

/**
 * Weather API route.
 * Primary source: data.gov.my (no API key required)
 *
 * Radar/satellite images served from MET Malaysia static CDN.
 * Marine forecast requires MET API token (not yet available).
 */

// MET Malaysia static CDN image URLs
const RADAR_IMAGES = {
  radar: "https://api.met.gov.my/static/images/radar-latest.gif",
  satellite: "https://api.met.gov.my/static/images/satelit-latest.gif",
  swirl: "https://api.met.gov.my/static/images/swirl-latest.gif",
};

/** The image's own Last-Modified time, or null: never claim freshness we can't verify. */
async function imageLastModified(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4_000) });
    const lm = res.ok ? res.headers.get("last-modified") : null;
    const t = lm ? new Date(lm) : null;
    return t && !Number.isNaN(t.getTime()) ? t.toISOString() : null;
  } catch {
    return null;
  }
}

// Short TTL so time-sensitive feeds (earthquakes, warnings, floods) stay fresh.
// The shared edge cache dedupes upstream calls; 2 min is plenty given data.gov.my
// publishes seismic warnings on the order of minutes, not seconds.
const CACHE_TTL_SECONDS = 120; // 2 minutes

export async function GET() {
  const data = await cachedJson<WeatherData>(
    "weather:data",
    CACHE_TTL_SECONDS,
    async () => {
      // Fetch all endpoints in parallel; each settles independently
      const [[forecastResult, warningResult, earthquakeResult, airQualityResult, floodResult], radarTimes] =
        await Promise.all([
          Promise.allSettled([
            fetchForecasts(),
            fetchWarnings(),
            fetchEarthquakes(),
            fetchAirQuality(),
            fetchFloodAlerts(),
          ]),
          Promise.all([
            imageLastModified(RADAR_IMAGES.radar),
            imageLastModified(RADAR_IMAGES.satellite),
            imageLastModified(RADAR_IMAGES.swirl),
          ]),
        ]);

      return {
        forecasts:
          forecastResult.status === "fulfilled" ? forecastResult.value : [],
        warnings:
          warningResult.status === "fulfilled" ? warningResult.value : [],
        earthquakes:
          earthquakeResult.status === "fulfilled" ? earthquakeResult.value : [],
        marineForecast: [],
        floodAlerts:
          floodResult.status === "fulfilled"
            ? floodResult.value
            : { stations: [], fetchedAt: new Date().toISOString() },
        airQuality:
          airQualityResult.status === "fulfilled"
            ? airQualityResult.value
            : { readings: [], fetchedAt: new Date().toISOString() },
        radar: {
          ...RADAR_IMAGES,
          updatedAt: { radar: radarTimes[0], satellite: radarTimes[1], swirl: radarTimes[2] },
        },
        fetchedAt: new Date().toISOString(),
      };
    }
  );

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

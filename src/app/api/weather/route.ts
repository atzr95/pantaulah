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

const CACHE_TTL_SECONDS = 600; // 10 minutes

export async function GET() {
  const data = await cachedJson<WeatherData>(
    "weather:data",
    CACHE_TTL_SECONDS,
    async () => {
      // Fetch all endpoints in parallel; each settles independently
      const [forecastResult, warningResult, earthquakeResult, airQualityResult, floodResult] =
        await Promise.allSettled([
          fetchForecasts(),
          fetchWarnings(),
          fetchEarthquakes(),
          fetchAirQuality(),
          fetchFloodAlerts(),
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
          updatedAt: new Date().toISOString(),
        },
        fetchedAt: new Date().toISOString(),
      };
    }
  );

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
    },
  });
}

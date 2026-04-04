import { NextResponse } from "next/server";


import {
  fetchForecasts,
  fetchWarnings,
  fetchEarthquakes,
  fetchAirQuality,
} from "@/lib/data/data-gov-weather";
import type { WeatherData } from "@/lib/data/weather-types";

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

// ── In-memory cache (avoids re-fetching on rapid requests) ──
let cached: { body: string; time: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export async function GET() {
  // Serve from cache if fresh
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return new NextResponse(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
      },
    });
  }

  // Fetch all endpoints in parallel; each settles independently
  const [forecastResult, warningResult, earthquakeResult, airQualityResult] =
    await Promise.allSettled([
      fetchForecasts(),
      fetchWarnings(),
      fetchEarthquakes(),
      fetchAirQuality(),
    ]);

  const data: WeatherData = {
    forecasts:
      forecastResult.status === "fulfilled" ? forecastResult.value : [],
    warnings:
      warningResult.status === "fulfilled" ? warningResult.value : [],
    earthquakes:
      earthquakeResult.status === "fulfilled" ? earthquakeResult.value : [],
    marineForecast: [],
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

  const body = JSON.stringify(data);
  cached = { body, time: Date.now() };

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
    },
  });
}

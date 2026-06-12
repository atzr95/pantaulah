import { NextResponse } from "next/server";


import {
  STATE_COORDINATES,
  type CurrentWeather,
} from "@/lib/data/weather-types";
import { cachedJson } from "@/lib/server/edge-cache";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const CURRENT_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "weather_code",
  "apparent_temperature",
  "precipitation",
  "pressure_msl",
  "uv_index",
  "cloud_cover",
].join(",");

export interface AllStatesCurrentWeather {
  states: Record<string, { locationName: string; current: CurrentWeather }>;
  fetchedAt: string;
}

export async function GET() {
  try {
    const response = await cachedJson<AllStatesCurrentWeather>(
      "weather:current:all",
      600,
      async () => {
        // Batch all 16 states into a single Open-Meteo request
        const lats = STATE_COORDINATES.map((c) => c.lat).join(",");
        const lons = STATE_COORDINATES.map((c) => c.lon).join(",");
        const url = `${OPEN_METEO_BASE}?latitude=${lats}&longitude=${lons}&current=${CURRENT_PARAMS}&timezone=Asia/Kuala_Lumpur`;

        const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        // Single coord returns object, multiple returns array
        const items: Array<{ current?: Record<string, number | string> }> =
          Array.isArray(data) ? data : [data];

        const states: AllStatesCurrentWeather["states"] = {};
        for (let i = 0; i < items.length && i < STATE_COORDINATES.length; i++) {
          const c = items[i]?.current;
          if (!c) continue;
          const coord = STATE_COORDINATES[i];
          states[coord.state] = {
            locationName: coord.locationName,
            current: {
              time: c.time,
              temperature: c.temperature_2m,
              apparentTemperature: c.apparent_temperature,
              humidity: c.relative_humidity_2m,
              windSpeed: c.wind_speed_10m,
              windDirection: c.wind_direction_10m,
              weatherCode: c.weather_code,
              precipitation: c.precipitation,
              pressure: c.pressure_msl,
              uvIndex: c.uv_index,
              cloudCover: c.cloud_cover,
            } as CurrentWeather,
          };
        }

        return {
          states,
          fetchedAt: new Date().toISOString(),
        };
      }
    );

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch current weather" },
      { status: 502 }
    );
  }
}

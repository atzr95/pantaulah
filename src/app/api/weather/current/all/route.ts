import { NextResponse } from "next/server";
import {
  STATE_COORDINATES,
  type CurrentWeather,
} from "@/lib/data/weather-types";

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
    // Fetch all 16 states in parallel
    const results = await Promise.allSettled(
      STATE_COORDINATES.map(async (coord) => {
        const url = `${OPEN_METEO_BASE}?latitude=${coord.lat}&longitude=${coord.lon}&current=${CURRENT_PARAMS}&timezone=Asia/Kuala_Lumpur`;
        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const c = data.current;
        return {
          state: coord.state,
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
      })
    );

    const states: AllStatesCurrentWeather["states"] = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        states[result.value.state] = {
          locationName: result.value.locationName,
          current: result.value.current,
        };
      }
    }

    const response: AllStatesCurrentWeather = {
      states,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch current weather" },
      { status: 502 }
    );
  }
}

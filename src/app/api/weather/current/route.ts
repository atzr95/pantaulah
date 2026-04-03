import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

import {
  STATE_COORDINATES,
  type CurrentWeatherResponse,
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

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");

  const coord = state
    ? STATE_COORDINATES.find(
        (s) => s.state.toLowerCase() === state.toLowerCase()
      )
    : STATE_COORDINATES.find((s) => s.state === "Kuala Lumpur"); // default KL

  if (!coord) {
    return NextResponse.json({ error: "State not found" }, { status: 404 });
  }

  try {
    const url = `${OPEN_METEO_BASE}?latitude=${coord.lat}&longitude=${coord.lon}&current=${CURRENT_PARAMS}&timezone=Asia/Kuala_Lumpur`;
    const res = await fetch(url, { next: { revalidate: 900 } }); // cache 15 min
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

    const data = await res.json();
    const c = data.current;

    const response: CurrentWeatherResponse = {
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
      },
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

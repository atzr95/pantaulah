"use client";

import { useState, useMemo } from "react";
import type { ForecastEntry } from "@/lib/data/weather-types";

/** Map forecast text to a simple icon character */
function getWeatherIcon(forecast: string): string {
  const f = forecast.toLowerCase();
  if (f.includes("thunder")) return "\u{1F329}\uFE0F";
  if (f.includes("heavy rain")) return "\u{1F327}\uFE0F";
  if (f.includes("rain")) return "\u{1F326}\uFE0F";
  if (f.includes("cloudy") || f.includes("overcast")) return "\u2601\uFE0F";
  if (f.includes("haz")) return "\u{1F32B}\uFE0F";
  if (f.includes("fair") || f.includes("no rain")) return "\u2600\uFE0F";
  return "\u{1F324}\uFE0F";
}

function getTempColor(temp: number): string {
  if (temp >= 35) return "var(--color-red)";
  if (temp >= 32) return "var(--color-amber)";
  return "var(--color-cyan)";
}

interface ForecastPanelProps {
  forecasts: ForecastEntry[];
}

export default function ForecastPanel({ forecasts }: ForecastPanelProps) {
  const [selectedDate, setSelectedDate] = useState(0); // 0 = today, 1 = tomorrow, etc.

  // Get unique dates
  const dates = useMemo(() => {
    const unique = [...new Set(forecasts.map((f) => f.date))].sort();
    return unique;
  }, [forecasts]);

  // Filter forecasts by selected date
  const dayForecasts = useMemo(
    () => forecasts.filter((f) => f.date === dates[selectedDate]),
    [forecasts, dates, selectedDate]
  );

  const dateLabels = ["TODAY", "TOMORROW", "DAY 3"];

  return (
    <div className="flex flex-col h-full">
      {/* Date selector */}
      <div className="flex gap-1.5 px-5 py-3 border-b border-[var(--color-border)]">
        {dates.map((date, i) => (
          <button
            key={date}
            onClick={() => setSelectedDate(i)}
            className={`px-3 py-1 text-[10px] tracking-wider border rounded transition-all ${
              selectedDate === i
                ? "bg-[rgba(0,212,255,0.12)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                : "border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)] bg-[rgba(10,10,15,0.7)]"
            }`}
          >
            {dateLabels[i] ?? `DAY ${i + 1}`}
            <span className="ml-1.5 text-[var(--color-text-dim)]">{date.slice(5)}</span>
          </button>
        ))}
      </div>

      {/* Forecast grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {dayForecasts.map((f) => (
            <div
              key={f.location.locationId}
              className="border border-[var(--color-border)] rounded-sm p-3.5 transition-all hover:border-[var(--color-border-bright)]"
              style={{ background: "rgba(13, 13, 20, 0.8)" }}
            >
              {/* Location header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[11px] font-bold text-[var(--color-text-bright)] tracking-wider">
                    {f.location.locationName.toUpperCase()}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-dim)] tracking-wider">
                    {f.location.state.toUpperCase()}
                  </div>
                </div>
                <div className="text-2xl">{getWeatherIcon(f.summaryForecast)}</div>
              </div>

              {/* Temperature */}
              <div className="flex items-baseline gap-1 mb-3">
                <span
                  className="text-2xl font-bold"
                  style={{ color: getTempColor(f.maxTemp) }}
                >
                  {f.maxTemp}°
                </span>
                <span className="text-sm text-[var(--color-text-dim)]">/</span>
                <span className="text-sm text-[var(--color-text-dim)]">{f.minTemp}°</span>
              </div>

              {/* Time-of-day breakdown */}
              <div className="space-y-1.5">
                {[
                  { label: "MORN", value: f.morningForecast },
                  { label: "AFTN", value: f.afternoonForecast },
                  { label: "NITE", value: f.nightForecast },
                ].map((slot) => (
                  <div key={slot.label} className="flex items-center gap-2">
                    <span className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] w-8 shrink-0">
                      {slot.label}
                    </span>
                    <span className="text-sm">{getWeatherIcon(slot.value)}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                      {slot.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

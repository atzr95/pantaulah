"use client";

import type { MarineForecastEntry } from "@/lib/data/weather-types";

function getSeaStateColor(maxWave: number): string {
  if (maxWave >= 3.0) return "var(--color-red)";
  if (maxWave >= 2.0) return "var(--color-amber)";
  return "var(--color-cyan)";
}

function getSeaStateLabel(maxWave: number): string {
  if (maxWave >= 4.0) return "VERY ROUGH";
  if (maxWave >= 3.0) return "ROUGH";
  if (maxWave >= 2.0) return "MODERATE";
  if (maxWave >= 1.0) return "SLIGHT";
  return "CALM";
}

function getWindArrow(direction: string): string {
  const d = direction.toLowerCase();
  if (d.includes("north") && d.includes("east")) return "\u2197";
  if (d.includes("north") && d.includes("west")) return "\u2196";
  if (d.includes("south") && d.includes("east")) return "\u2198";
  if (d.includes("south") && d.includes("west")) return "\u2199";
  if (d.includes("north")) return "\u2191";
  if (d.includes("south")) return "\u2193";
  if (d.includes("east")) return "\u2192";
  if (d.includes("west")) return "\u2190";
  return "\u2194"; // variable
}

interface MarinePanelProps {
  marineForecast: MarineForecastEntry[];
  sheetSnap?: "peek" | "half" | "full";
}

export default function MarinePanel({ marineForecast, sheetSnap = "half" }: MarinePanelProps) {
  const sheetPadding =
    sheetSnap === "full" ? "92vh" : sheetSnap === "half" ? "52vh" : "130px";

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-4">
      <div className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-4">
        MALAYSIAN WATERS FORECAST
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {marineForecast.map((m) => {
          const seaColor = getSeaStateColor(m.maxWaveHeight);
          return (
            <div
              key={m.locationId}
              className="border rounded-sm p-4 transition-all hover:border-[var(--color-border-bright)]"
              style={{
                background: "rgba(13, 13, 20, 0.8)",
                borderColor: "var(--color-border)",
                borderLeftWidth: "3px",
                borderLeftColor: seaColor,
              }}
            >
              {/* Location */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-[11px] font-bold text-[var(--color-text-bright)] tracking-wider">
                  {m.locationName.toUpperCase()}
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-wider shrink-0"
                  style={{
                    background: `${seaColor}15`,
                    color: seaColor,
                    border: `1px solid ${seaColor}40`,
                  }}
                >
                  {getSeaStateLabel(m.maxWaveHeight)}
                </span>
              </div>

              {/* Forecast text */}
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-3">
                {m.forecast}
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* Waves */}
                <div>
                  <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] mb-1">
                    WAVES
                  </div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: seaColor }}
                  >
                    {m.minWaveHeight}–{m.maxWaveHeight}m
                  </div>
                </div>

                {/* Wind */}
                <div>
                  <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] mb-1">
                    WIND
                  </div>
                  <div className="text-sm font-bold text-[var(--color-text-bright)]">
                    {m.windSpeed}
                  </div>
                </div>

                {/* Direction */}
                <div>
                  <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] mb-1">
                    DIRECTION
                  </div>
                  <div className="text-sm font-bold text-[var(--color-text-bright)]">
                    <span className="mr-1">{getWindArrow(m.windDirection)}</span>
                    {m.windDirection}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-4 text-[10px] text-[var(--color-text-dim)]">
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1"
            style={{ background: "var(--color-cyan)" }}
          />
          CALM/SLIGHT
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1"
            style={{ background: "var(--color-amber)" }}
          />
          MODERATE
        </span>
        <span>
          <span
            className="inline-block w-2 h-2 rounded-full mr-1"
            style={{ background: "var(--color-red)" }}
          />
          ROUGH/VERY ROUGH
        </span>
      </div>

      {/* Mobile: bottom spacer for sheet */}
      <div className="lg:hidden" style={{ height: sheetPadding }} />
    </div>
  );
}

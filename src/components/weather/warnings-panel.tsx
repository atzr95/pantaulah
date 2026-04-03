"use client";

import type { WarningEntry, EarthquakeEntry } from "@/lib/data/weather-types";

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "DANGER":
      return "var(--color-red)";
    case "WARNING":
      return "var(--color-amber)";
    case "ADVISORY":
      return "var(--color-cyan)";
    default:
      return "var(--color-text-muted)";
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case "THUNDERSTORM":
      return "\u{1F329}\uFE0F";
    case "RAIN":
      return "\u{1F327}\uFE0F";
    case "WINDSEA":
      return "\u{1F30A}";
    case "CYCLONE":
      return "\u{1F300}";
    case "QUAKETSUNAMI":
      return "\u{1F30D}";
    default:
      return "\u26A0\uFE0F";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getQuakeColor(magnitude: number): string {
  if (magnitude >= 6) return "var(--color-red)";
  if (magnitude >= 5) return "var(--color-amber)";
  return "var(--color-text-muted)";
}

interface WarningsPanelProps {
  warnings: WarningEntry[];
  earthquakes: EarthquakeEntry[];
}

export default function WarningsPanel({
  warnings,
  earthquakes,
}: WarningsPanelProps) {
  const activeWarnings = warnings.filter(
    (w) => new Date(w.validTo) > new Date()
  );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Active Warnings */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[10px] tracking-[3px] text-[var(--color-cyan)]">
            ACTIVE WARNINGS
          </div>
          {activeWarnings.length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "var(--color-red)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              {activeWarnings.length} ACTIVE
            </span>
          )}
        </div>

        {activeWarnings.length === 0 ? (
          <div
            className="border border-[var(--color-border)] rounded-sm p-6 text-center"
            style={{ background: "rgba(13, 13, 20, 0.8)" }}
          >
            <div className="text-[var(--color-green)] text-sm mb-1">
              \u2713 ALL CLEAR
            </div>
            <div className="text-[10px] text-[var(--color-text-dim)]">
              No active weather warnings
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeWarnings.map((w) => {
              const severityColor = getSeverityColor(w.severity);
              return (
                <div
                  key={w.id}
                  className="border rounded-sm p-4 transition-all hover:border-opacity-60"
                  style={{
                    background: "rgba(13, 13, 20, 0.8)",
                    borderColor: severityColor,
                    borderLeftWidth: "3px",
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {getCategoryIcon(w.category)}
                      </span>
                      <div>
                        <div className="text-[11px] font-bold text-[var(--color-text-bright)] tracking-wider">
                          {w.title.toUpperCase()}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-dim)]">
                          {w.category}
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-sm font-bold tracking-wider"
                      style={{
                        background: `${severityColor}15`,
                        color: severityColor,
                        border: `1px solid ${severityColor}40`,
                      }}
                    >
                      {w.severity}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mb-3">
                    {w.text}
                  </p>

                  {/* Instruction */}
                  {w.instruction && (
                    <div
                      className="text-[10px] p-2 rounded-sm mb-3"
                      style={{
                        background: `${severityColor}08`,
                        borderLeft: `2px solid ${severityColor}60`,
                        color: "var(--color-text)",
                      }}
                    >
                      {w.instruction}
                    </div>
                  )}

                  {/* Affected areas */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {w.affectedAreas.map((area) => (
                      <span
                        key={area}
                        className="text-[10px] px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: "rgba(0, 212, 255, 0.08)",
                          border: "1px solid rgba(0, 212, 255, 0.15)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {area.toUpperCase()}
                      </span>
                    ))}
                  </div>

                  {/* Time range */}
                  <div className="text-[10px] text-[var(--color-text-dim)] flex gap-3">
                    <span>
                      VALID: {formatTime(w.validFrom)} — {formatTime(w.validTo)}
                    </span>
                    <span>ISSUED: {formatTime(w.issuedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Seismic Activity */}
      <div>
        <div className="text-[10px] tracking-[3px] text-[var(--color-cyan)] mb-3">
          RECENT SEISMIC ACTIVITY
        </div>

        <div className="space-y-2">
          {earthquakes.map((eq, i) => (
            <div
              key={i}
              className="border border-[var(--color-border)] rounded-sm p-3 flex items-center gap-4 transition-all hover:border-[var(--color-border-bright)]"
              style={{ background: "rgba(13, 13, 20, 0.8)" }}
            >
              {/* Magnitude circle */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{
                  border: `2px solid ${getQuakeColor(eq.magnitude)}`,
                  background: `${getQuakeColor(eq.magnitude)}10`,
                }}
              >
                <span
                  className="text-base font-bold"
                  style={{ color: getQuakeColor(eq.magnitude) }}
                >
                  {eq.magnitude.toFixed(1)}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--color-text-bright)] font-bold truncate">
                  {eq.location}
                </div>
                <div className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
                  {formatDate(eq.datetime)} {formatTime(eq.datetime)} MYT
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-[var(--color-text-dim)]">
                  <span>DEPTH: {eq.depth} KM</span>
                  <span>TYPE: {eq.magnitudeType.toUpperCase()}</span>
                  {eq.status !== "NORMAL" && (
                    <span
                      className="px-1 rounded-sm"
                      style={{
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "var(--color-red)",
                      }}
                    >
                      {eq.status.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>

              {/* Coordinates */}
              <div className="text-[10px] text-[var(--color-text-dim)] text-right shrink-0">
                <div>{eq.lat.toFixed(2)}°N</div>
                <div>{eq.lon.toFixed(2)}°E</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

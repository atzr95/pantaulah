/**
 * Named UI colors for canvas/SVG contexts where CSS variables can't be used
 * as presentation attributes. Keep in sync with the --color-poi-* variables
 * in src/app/globals.css.
 */
export const POI_COLORS = {
  airport: "#ff9f43",
  university: "#ffd43b",
  port: "#2ed573",
  flight: "#ff6b6b",
  train: "#e879f9",
  bus: "#fb923c",
} as const;

export const OVERLAY_COLORS = {
  highway: "rgba(255, 200, 50, 0.35)",
  rail: "#e2e8f0",
} as const;

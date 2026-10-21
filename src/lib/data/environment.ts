import { MALAYSIA_STATES } from "./states";

export interface RiverStation {
  id: string;
  name: string;
  state: string;
  district: string;
  lat: number;
  lon: number;
  level: number;
  status: "Normal" | "Alert" | "Warning" | "Danger" | "Unknown";
  threshold: number | null;
  trend: string;
  observedAt: string;
}

export interface Shelter {
  id: string;
  name: string;
  state: string;
  district: string;
  lat: number;
  lon: number;
  disaster: string;
  people: number;
  families: number;
  capacityUsed: number;
}

export interface FireDetection {
  id: string;
  lat: number;
  lon: number;
  observedAt: string;
  confidence: string;
  satellite: string;
}

export interface RiverHistory {
  name: string;
  thresholds: { label: string; value: number }[];
  readings: { time: string; value: number | null }[];
}

export interface EnvironmentData {
  rivers: RiverStation[];
  shelters: Shelter[];
  fires: FireDetection[];
}

export type EnvironmentSelection =
  | { kind: "river"; data: RiverStation }
  | { kind: "shelter"; data: Shelter }
  | { kind: "fire"; data: FireDetection };

export const ENVIRONMENT_COLORS = {
  Normal: "#4ddd92",
  Alert: "#facc15",
  Warning: "#ff9500",
  Danger: "#ff6b72",
  Unknown: "#94a3b8",
};

/** Fire heat glow, few → many detections; shared by the map layer and its legends. */
export const FIRE_HEAT = ["#ffe08a", "#ff8a3d", "#e8412c"] as const;
export const FIRE_HEAT_GRADIENT = `linear-gradient(90deg, ${FIRE_HEAT.join(", ")})`;

export function malaysiaState(name: string): string | null {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/^(wilayah persekutuan|w\.p\.)\s*/, "");
  if (cleaned === "pulau pinang") return "Penang";
  return (
    MALAYSIA_STATES.find((s) => s.topoName.toLowerCase() === cleaned)
      ?.topoName ?? null
  );
}

/** JPS dates are Malaysia time, including when the server runs in UTC. */
export function jpsDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+08:00`;
  return Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : null;
}

export function observationTime(time: string): string {
  return (
    new Date(time).toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " MYT"
  );
}

export const treeLossTiles = (year: number) =>
  `https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.13/dynamic/{z}/{x}/{y}.png?start_year=${year}&end_year=${year}&render_type=true_color`;

export function currentEnvironmentSelection(
  selection: EnvironmentSelection | null,
  data: {
    rivers: RiverStation[] | null;
    shelters: Shelter[] | null;
    fires: FireDetection[] | null;
  },
): { selection: EnvironmentSelection; current: boolean } | null {
  if (!selection) return null;
  if (selection.kind === "river") {
    const latest = data.rivers?.find((r) => r.id === selection.data.id);
    return {
      selection: latest ? { kind: "river", data: latest } : selection,
      current: !!latest,
    };
  }
  if (selection.kind === "shelter") {
    const latest = data.shelters?.find((s) => s.id === selection.data.id);
    return {
      selection: latest ? { kind: "shelter", data: latest } : selection,
      current: !!latest,
    };
  }
  return {
    selection,
    current: data.fires?.some((f) => f.id === selection.data.id) ?? false,
  };
}

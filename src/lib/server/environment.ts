import { z } from "zod";
import { cachedJson } from "./edge-cache";
import { MALAYSIA_STATES } from "@/lib/data/states";
import {
  jpsDate,
  malaysiaState,
  type RiverStation,
  type Shelter,
  type FireDetection,
  type RiverHistory,
} from "@/lib/data/environment";

const numeric = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > -1000 ? n : null;
};
const coord = {
  lat: z.coerce.number().min(0).max(8),
  lon: z.coerce.number().min(99).max(120),
};
const jpsStation = z.object({
  station_id: z.string().regex(/^[A-Za-z0-9_()-]{1,40}$/),
  station_name: z.string().min(1),
  state: z.string(),
  district: z.string(),
  water_level: z.string().nullable(),
  alert: z.string().nullable(),
  warning: z.string().nullable(),
  danger: z.string().nullable(),
  wl_severity: z.string().nullable(),
  last_update: z.string(),
  trend: z.string().nullable(),
  graph_url: z.string().nullable(),
});
const shelterSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().min(1),
  latti: z.coerce.number(),
  longi: z.coerce.number(),
  negeri: z.string(),
  daerah: z.string(),
  bencana: z.string(),
  mangsa: z.coerce.number().nonnegative(),
  keluarga: z.coerce.number().nonnegative(),
  kapasiti: z.coerce.number().nonnegative(),
});

/** Cache a parsed source together with its download time, so the UI shows the real data age. */
function cachedSource<T>(key: string, ttl: number, load: () => Promise<T>) {
  return cachedJson(key, ttl, async () => ({
    data: await load(),
    fetchedAt: new Date().toISOString(),
  }));
}

async function get(url: string, timeout = 15_000): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  return res;
}

export function parseRivers(raw: unknown, now = Date.now()): RiverStation[] {
  const rows = z.array(z.unknown()).parse(raw);
  const rivers: RiverStation[] = [];
  for (const row of rows) {
    const parsed = jpsStation.safeParse(row);
    if (!parsed.success) continue;
    const s = parsed.data,
      level = numeric(s.water_level),
      observedAt = jpsDate(s.last_update),
      state = malaysiaState(s.state);
    if (level === null || !observedAt || !state) continue;
    const age = now - Date.parse(observedAt);
    if (age < -300_000 || age > 3_600_000) continue;
    const statuses = {
      NORMAL: "Normal", WASPADA: "Alert", AMARAN: "Warning", BAHAYA: "Danger",
    } as const;
    const severity = z.enum(["NORMAL", "WASPADA", "AMARAN", "BAHAYA"]).safeParse(s.wl_severity);
    const status = severity.success ? statuses[severity.data] : "Unknown";
    const alert = numeric(s.alert),
      warning = numeric(s.warning),
      danger = numeric(s.danger);
    const validThresholds =
      alert !== null && warning !== null && danger !== null &&
      alert > 0 && warning > alert && danger > warning;
    const threshold = status === "Danger" ? danger
      : status === "Warning" ? warning : status === "Alert" ? alert : null;
    const verifiedStatus =
      status !== "Normal" && (!validThresholds || threshold === null || level < threshold)
        ? "Unknown" : status;
    const trend = s.trend?.toLowerCase();
    rivers.push({
      id: `${state.replaceAll(" ", "-")}_${s.station_id}`,
      name: s.station_name,
      state,
      district: s.district,
      // The replacement national feed has no coordinates. Keep readings usable without false map pins.
      lat: null,
      lon: null,
      graphUrl: jpsGraphUrl(s.graph_url),
      level,
      status: verifiedStatus,
      threshold,
      trend: trend === "rising" ? "Rising" : trend === "receding" ? "Receding" : s.trend ?? "",
      observedAt,
    });
  }
  if (!rivers.length) throw new Error("No recent river readings available");
  return rivers;
}

export function fetchRivers() {
  return cachedSource("environment:rivers:v4", 120, async () => {
    // Use the same public token as JPS's state selector; do not hard-code a token that can change.
    const token = await cachedJson("environment:jps-token:v1", 300, async () => {
      const html = await (
        await get("https://publicinfobanjir.water.gov.my/waterleveldata/Kedah")
      ).text();
      const value = /['"]Authorization['"]\s*:\s*['"]Bearer ([^'"]+)['"]/.exec(html)?.[1];
      if (!value) throw new Error("JPS public data access unavailable");
      return value;
    });
    // Putrajaya has no separate JPS table. Require all published tables, so a failed state cannot mean all clear.
    const states = MALAYSIA_STATES.filter(s => s.topoName !== "Putrajaya");
    const rows = await Promise.all(
      states.map(async (state) => {
        const res = await fetch("https://publicinfobanjir.water.gov.my/api/detailstation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            state: state.apiName.replace("W.P.", "Wilayah Persekutuan"),
            district: "ALL", station_name: "ALL", parameter: "waterlevel",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`JPS ${state.topoName} returned ${res.status}`);
        return z.array(jpsStation).parse(await res.json());
      }),
    );
    return parseRivers(rows.flat());
  });
}

/** Only link to official sources, and never use a client-supplied URL for history requests. */
function jpsGraphUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !url.hostname.endsWith(".gov.my") || url.username || url.password || url.port ||
      !["http:", "https:"].includes(url.protocol)
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseShelters(raw: unknown): Shelter[] {
  const rows = z.object({ points: z.array(z.unknown()) }).parse(raw).points;
  const shelters = rows.flatMap((row): Shelter[] => {
    const parsed = shelterSchema.safeParse(row);
    if (!parsed.success) return [];
    const s = parsed.data,
      state = malaysiaState(s.negeri);
    const location = z.object(coord).safeParse({ lat: s.latti, lon: s.longi });
    if (!state || !location.success) return [];
    return [
      {
        id: String(s.id),
        name: s.name,
        state,
        district: s.daerah,
        ...location.data,
        disaster: s.bencana,
        people: s.mangsa,
        families: s.keluarga,
        capacityUsed: s.kapasiti,
      },
    ];
  });
  if (rows.length && !shelters.length)
    throw new Error("Shelter locations unavailable");
  return shelters;
}

export function fetchShelters() {
  return cachedSource("environment:shelters:v2", 300, async () =>
    parseShelters(
      await (
        await get(
          "https://infobencanajkmv2.jkm.gov.my/api/pusat-buka.php?a=0&b=0",
        )
      ).json(),
    ),
  );
}

export function parseFires(csv: string, now = Date.now()): FireDetection[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const names = header.split(",");
  if (
    ![
      "latitude",
      "longitude",
      "acq_date",
      "acq_time",
      "confidence",
      "satellite",
    ].every((key) => names.includes(key))
  )
    throw new Error("Invalid fire data");
  const result = new Map<string, FireDetection>();
  // Malaysia and Indonesia (where most haze starts), up to the live map's east edge at 126°E.
  // NASA's selected fields contain no quoted commas; use a full CSV reader if that format changes.
  for (const line of lines) {
    const values = line.split(","),
      row = Object.fromEntries(names.map((n, i) => [n, values[i]]));
    const lat = Number(row.latitude),
      lon = Number(row.longitude),
      time = row.acq_time?.padStart(4, "0");
    if (
      !row.latitude ||
      !row.longitude ||
      !row.satellite ||
      !row.confidence ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -11 ||
      lat > 8.5 ||
      lon < 94 ||
      lon > 126 ||
      !/^\d{4}$/.test(time ?? "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.acq_date ?? "")
    )
      continue;
    const date = Date.parse(
      `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`,
    );
    if (
      !Number.isFinite(date) ||
      date > now + 300_000 ||
      now - date > 7 * 86_400_000
    )
      continue;
    const id = `${row.satellite}:${lat}:${lon}:${date}`;
    result.set(id, {
      id,
      lat,
      lon,
      observedAt: new Date(date).toISOString(),
      confidence: row.confidence,
      satellite: row.satellite,
    });
  }
  return [...result.values()];
}

export function fetchFires() {
  // shortcut: one satellite keeps the shared download small; add more if coverage needs justify it.
  return cachedSource("environment:fires:v3", 1800, async () =>
    parseFires(
      await (
        await get(
          "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv",
          60_000,
        )
      ).text(),
    ),
  );
}

export function parseRiverHistory(raw: unknown): RiverHistory {
  const data = z
    .object({
      stationName: z.string(),
      normalSetPoint: z.number().nullable(),
      alertSetPoint: z.number().nullable(),
      warningSetPoint: z.number().nullable(),
      dangerSetPoint: z.number().nullable(),
      data: z.array(z.object({ timestamp: z.string(), wl: z.number().nullable() })),
    })
    .parse(raw);
  const thresholds = ([
    ["Normal", data.normalSetPoint],
    ["Alert", data.alertSetPoint],
    ["Warning", data.warningSetPoint],
    ["Danger", data.dangerSetPoint],
  ] as const).flatMap(([label, v]) => {
    const value = numeric(v);
    return value === null ? [] : [{ label, value }];
  });
  const validThresholds =
    thresholds.length === 4 &&
    thresholds.every((t, i) => i === 0 || t.value > thresholds[i - 1].value);
  return {
    name: data.stationName,
    thresholds: validThresholds ? thresholds : [],
    readings: data.data.flatMap((v) => {
      const time = jpsDate(v.timestamp);
      return time ? [{ time, value: numeric(v.wl) }] : [];
    }),
  };
}

export function fetchRiverHistory(station: string) {
  return cachedSource(`environment:history:v3:${station}`, 300, async () => {
    const { data: rivers } = await fetchRivers();
    const river = rivers.find(r => r.id === station);
    const url = river?.graphUrl ? new URL(river.graphUrl) : null;
    if (!url || !/^\/WaterLevel\/Station\/\d+$/.test(url.pathname))
      throw new Error("Station history unavailable");
    url.pathname = url.pathname.replace("/Station/", "/GetWaterLevelGraph/");
    return parseRiverHistory(await (await get(url.href)).json());
  });
}

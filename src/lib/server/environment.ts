import { z } from "zod";
import { cachedJson } from "./edge-cache";
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
  a: z.string().min(1),
  b: z.string().min(1),
  c: z.string(),
  d: z.string(),
  e: z.string(),
  f: z.string(),
  i: z.string(),
  m: z.string(),
  n: z.string(),
  o: z.string(),
  q: z.string(),
  s: z.string(),
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
      level = numeric(s.m),
      observedAt = jpsDate(s.q),
      state = malaysiaState(s.f);
    const location = z.object(coord).safeParse({ lat: s.c, lon: s.d });
    if (
      !s.i.includes("WL") ||
      level === null ||
      !observedAt ||
      !state ||
      !location.success
    )
      continue;
    const age = now - Date.parse(observedAt);
    if (age < -300_000 || age > 3_600_000) continue;
    const status = z
      .enum(["Normal", "Alert", "Warning", "Danger"])
      .safeParse(s.n);
    if (!status.success) continue;
    const threshold = numeric(s.o);
    // Some stations report Danger against a missing zero threshold; do not repeat that as a warning.
    const verifiedStatus =
      status.data !== "Normal" && (threshold === null || threshold === 0)
        ? "Unknown"
        : status.data;
    rivers.push({
      id: s.a,
      name: s.b,
      state,
      district: s.e,
      ...location.data,
      level,
      status: verifiedStatus,
      threshold,
      trend: s.s,
      observedAt,
    });
  }
  if (!rivers.length) throw new Error("No recent river readings available");
  return rivers;
}

export function fetchRivers() {
  return cachedSource("environment:rivers:v3", 120, async () =>
    parseRivers(
      await (
        await get(
          "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/latestreadingstrendabc.json",
        )
      ).json(),
    ),
  );
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
      info: z.object({
        name: z.string(),
        normal: z.string(),
        alert: z.string(),
        warning: z.string(),
        danger: z.string(),
      }),
      values: z.array(z.object({ dt: z.string(), final: z.string() })),
    })
    .parse(raw);
  const thresholds = [
    ["Normal", data.info.normal],
    ["Alert", data.info.alert],
    ["Warning", data.info.warning],
    ["Danger", data.info.danger],
  ].flatMap(([label, v]) => {
    const value = numeric(v);
    return value === null ? [] : [{ label, value }];
  });
  const validThresholds =
    thresholds.length === 4 &&
    thresholds.every((t, i) => i === 0 || t.value > thresholds[i - 1].value);
  return {
    name: data.info.name,
    thresholds: validThresholds ? thresholds : [],
    readings: data.values.flatMap((v) => {
      const time = jpsDate(v.dt);
      return time ? [{ time, value: numeric(v.final) }] : [];
    }),
  };
}

export function fetchRiverHistory(station: string) {
  return cachedSource(`environment:history:v2:${station}`, 300, async () =>
    parseRiverHistory(
      await (
        await get(
          `https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/query/getwaterlevellast7dayslead.php?extra=&station=${encodeURIComponent(station)}`,
        )
      ).json(),
    ),
  );
}

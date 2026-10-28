/** Shape returned by /api/live/grid. */
export interface LiveGrid {
  lons: number[];
  lats: number[];
  /** ISO hour strings (UTC, no Z) for the 24 steps */
  times: string[];
  /** [pointIndex][hour] — pointIndex = latIdx * lons.length + lonIdx */
  windSpeed: number[][]; // km/h
  windDir: number[][]; // degrees (meteorological, from)
  cloud: number[][]; // %
  pm25: number[][]; // µg/m³
  fetchedAt: string;
}

/** Grid bounding box as MapLibre image-source coordinates (TL, TR, BR, BL). */
export type Corners = [[number, number], [number, number], [number, number], [number, number]];
export function gridCorners(g: LiveGrid): Corners {
  const w = g.lons[0], e = g.lons[g.lons.length - 1];
  const s = g.lats[0], n = g.lats[g.lats.length - 1];
  return [[w, n], [e, n], [e, s], [w, s]];
}

/**
 * Index of the first hour worth keeping from an hourly UTC series: the hour before
 * the one containing `now`, so the current hour always has a neighbour either side.
 */
export function windowStart(times: string[], now = Date.now()): number {
  const i = times.findIndex((t) => new Date(t + "Z").getTime() > now);
  return Math.max(0, (i === -1 ? times.length : i) - 2);
}

/** Index of the grid hour closest to now (clamped to the 24 available). */
export function currentHourIndex(g: LiveGrid): number {
  const now = Date.now();
  let best = 0, bestDiff = Infinity;
  g.times.forEach((t, i) => {
    const d = Math.abs(new Date(t + "Z").getTime() - now);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

/** Catmull-Rom weights for the four samples around a point `t` (0–1) between the middle two. */
function cubicWeights(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/**
 * Bicubic (Catmull-Rom) sample of one grid field: smooth curves instead of the creases
 * bilinear leaves on a 1.25° grid. Edge rows repeat. Interpolates log(1 + v), which keeps
 * the curve gentle around a single smoky point (PM2.5 jumps 20 → 600 between neighbours),
 * and clamps to the four surrounding points so a peak cannot ring into a false clear hole.
 * Returns 0 outside the grid.
 */
export function sampleGridCubic(g: LiveGrid, field: number[][], h: number, lon: number, lat: number): number {
  const nx = g.lons.length, ny = g.lats.length;
  const step = g.lons[1] - g.lons[0];
  const fx = (lon - g.lons[0]) / step, fy = (lat - g.lats[0]) / step;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return 0;
  const x0 = Math.min(Math.floor(fx), nx - 2), y0 = Math.min(Math.floor(fy), ny - 2);
  const wx = cubicWeights(fx - x0), wy = cubicWeights(fy - y0);
  const v = (x: number, y: number) => Math.log1p(Math.max(0, field[Math.max(0, Math.min(ny - 1, y)) * nx + Math.max(0, Math.min(nx - 1, x))]?.[h] ?? 0));
  let sum = 0;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) sum += v(x0 - 1 + i, y0 - 1 + j) * wx[i] * wy[j];
  const near = [v(x0, y0), v(x0 + 1, y0), v(x0, y0 + 1), v(x0 + 1, y0 + 1)];
  return Math.expm1(Math.max(Math.min(...near), Math.min(Math.max(...near), sum)));
}

/** Wind as an east/north vector in km/h. Meteorological direction = where wind comes FROM. */
export function sampleWind(g: LiveGrid, h: number, lon: number, lat: number): [number, number] {
  // Interpolate u/v components rather than speed/direction to avoid 359°→1° wraparound
  const nx = g.lons.length, ny = g.lats.length;
  const step = g.lons[1] - g.lons[0];
  const fx = (lon - g.lons[0]) / step, fy = (lat - g.lats[0]) / step;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return [0, 0];
  const x0 = Math.min(Math.floor(fx), nx - 2), y0 = Math.min(Math.floor(fy), ny - 2);
  const tx = fx - x0, ty = fy - y0;
  let u = 0, v = 0;
  const add = (x: number, y: number, w: number) => {
    const i = y * nx + x;
    const s = g.windSpeed[i]?.[h] ?? 0;
    const d = ((g.windDir[i]?.[h] ?? 0) * Math.PI) / 180;
    u += -s * Math.sin(d) * w;
    v += -s * Math.cos(d) * w;
  };
  add(x0, y0, (1 - tx) * (1 - ty));
  add(x0 + 1, y0, tx * (1 - ty));
  add(x0, y0 + 1, (1 - tx) * ty);
  add(x0 + 1, y0 + 1, tx * ty);
  return [u, v];
}

/**
 * Wind arrows on every `every`-th grid point for hour `h`. `to` is the compass bearing the
 * wind blows towards (the source gives where it comes from), i.e. where smoke drifts.
 */
export function windArrows(g: LiveGrid, h: number, every = 2): { lon: number; lat: number; to: number; speed: number }[] {
  const out: { lon: number; lat: number; to: number; speed: number }[] = [];
  for (let y = 0; y < g.lats.length; y += every)
    for (let x = 0; x < g.lons.length; x += every) {
      const i = y * g.lons.length + x;
      out.push({ lon: g.lons[x], lat: g.lats[y], to: ((g.windDir[i]?.[h] ?? 0) + 180) % 360, speed: g.windSpeed[i]?.[h] ?? 0 });
    }
  return out;
}

/**
 * Paint a smooth raster of one field into an offscreen canvas and return a
 * data URL for a MapLibre `image` source. `color(value)` returns [r,g,b,a].
 * ponytail: canvas raster instead of a heatmap layer — honest blobs, ~1ms per frame.
 */
export function renderField(
  g: LiveGrid,
  field: number[][],
  h: number,
  color: (v: number) => [number, number, number, number],
  cellsPerDegree = 6
): string {
  const w = Math.round((g.lons[g.lons.length - 1] - g.lons[0]) * cellsPerDegree);
  const ht = Math.round((g.lats[g.lats.length - 1] - g.lats[0]) * cellsPerDegree);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = ht;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, ht);
  for (let py = 0; py < ht; py++) {
    // Image row 0 is north (top)
    const lat = g.lats[g.lats.length - 1] - (py + 0.5) / cellsPerDegree;
    for (let px = 0; px < w; px++) {
      const lon = g.lons[0] + (px + 0.5) / cellsPerDegree;
      const [r, gg, b, a] = color(sampleGridCubic(g, field, h, lon, lat));
      // Feather alpha over the outer 1.5° so the grid box has no hard edge
      const edge = Math.min(lon - g.lons[0], g.lons[g.lons.length - 1] - lon, lat - g.lats[0], g.lats[g.lats.length - 1] - lat);
      const feather = Math.max(0, Math.min(1, edge / 1.5));
      const o = (py * w + px) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = Math.round(a * feather);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// Smog ramp, light → dark: pale pink, pink, magenta, plum, deep purple. Bright enough to read on
// the dark basemap and on satellite imagery, where the old amber → brown ramp sank into both.
const SMOG_STOPS: [number, [number, number, number]][] = [
  [0, [255, 228, 240]], [0.3, [247, 150, 196]], [0.55, [222, 52, 160]], [0.8, [140, 22, 140]], [1, [78, 10, 108]],
];
const SMOG_MIN = 12, SMOG_MAX = 500;

/**
 * PM2.5 µg/m³ → smog tint. Clean air (< 12) stays transparent. Log scale up to 500, so a
 * real haze event (Sumatra and Kalimantan smoke can pass 600) keeps its structure instead
 * of flattening into one blob above 150.
 */
export function smogColor(pm: number): [number, number, number, number] {
  if (pm < SMOG_MIN) return [0, 0, 0, 0];
  const t = smogScale(pm);
  const k = SMOG_STOPS.findIndex(([s]) => s >= t);
  const [s0, c0] = SMOG_STOPS[Math.max(0, k - 1)], [s1, c1] = SMOG_STOPS[k];
  const f = s1 === s0 ? 0 : (t - s0) / (s1 - s0);
  // Alpha eases in, so the wide 12–25 µg/m³ fringe is a faint tint rather than a grey veil
  const a = Math.round(Math.pow(Math.min(1, t / 0.55), 1.4) * 215);
  return [0, 1, 2].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * f)).concat(a) as [number, number, number, number];
}

/** Where `pm` sits on the smog scale, 0 (12 µg/m³) to 1 (500 µg/m³). */
export const smogScale = (pm: number) => Math.max(0, Math.min(1, Math.log(pm / SMOG_MIN) / Math.log(SMOG_MAX / SMOG_MIN)));

/** CSS gradient matching smogColor across the whole scale, for the legend. */
export const SMOG_GRADIENT = `linear-gradient(90deg, ${SMOG_STOPS.map(([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;

/** Cloud cover % → soft white. Transparent under 30%. */
export function cloudColor(pct: number): [number, number, number, number] {
  if (pct < 30) return [0, 0, 0, 0];
  const t = (pct - 30) / 70;
  return [225, 235, 245, Math.round(t * t * 120)];
}

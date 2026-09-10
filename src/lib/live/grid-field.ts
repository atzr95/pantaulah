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

/**
 * Bilinear sample of one grid field at (lon, lat) for hour `h`.
 * Returns 0 outside the grid.
 */
export function sampleGrid(g: LiveGrid, field: number[][], h: number, lon: number, lat: number): number {
  const nx = g.lons.length, ny = g.lats.length;
  const step = g.lons[1] - g.lons[0];
  const fx = (lon - g.lons[0]) / step, fy = (lat - g.lats[0]) / step;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return 0;
  const x0 = Math.min(Math.floor(fx), nx - 2), y0 = Math.min(Math.floor(fy), ny - 2);
  const tx = fx - x0, ty = fy - y0;
  const v = (x: number, y: number) => field[y * nx + x]?.[h] ?? 0;
  return (
    v(x0, y0) * (1 - tx) * (1 - ty) +
    v(x0 + 1, y0) * tx * (1 - ty) +
    v(x0, y0 + 1) * (1 - tx) * ty +
    v(x0 + 1, y0 + 1) * tx * ty
  );
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
      const [r, gg, b, a] = color(sampleGrid(g, field, h, lon, lat));
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

/**
 * PM2.5 µg/m³ → smog tint. Clear air (< 25, "good/moderate") stays transparent;
 * haze ramps amber → brown → dark red, fully opaque by 150 (Malaysian API "very unhealthy").
 */
export function smogColor(pm: number): [number, number, number, number] {
  if (pm < 25) return [0, 0, 0, 0];
  const t = Math.min(1, (pm - 25) / 125);
  const a = Math.round(Math.pow(t, 0.7) * 200);
  return [Math.round(215 - t * 110), Math.round(160 - t * 125), Math.round(70 - t * 50), a];
}

/** Cloud cover % → soft white. Transparent under 30%. */
export function cloudColor(pct: number): [number, number, number, number] {
  if (pct < 30) return [0, 0, 0, 0];
  const t = (pct - 30) / 70;
  return [225, 235, 245, Math.round(t * t * 120)];
}

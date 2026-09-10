/**
 * Detailed rail geometry for the live map (the SVG state map keeps the coarse
 * rail-lines.json). Pulls every rail / light_rail / subway / monorail way in
 * Malaysia from Overpass, simplifies to ~6 m, writes GeoJSON.
 *
 * Run: npx tsx scripts/build-rail-detail.ts [path-to-overpass.json]
 * Output: src/lib/data/rail-detail.json  (FeatureCollection, property `kind`)
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const QUERY =
  '[out:json][timeout:180];(way["railway"~"^(rail|light_rail|subway|monorail)$"]["service"!~"."]["railway:preserved"!~"."](0.8,99.5,7.5,119.5););out geom;';
const TOLERANCE_DEG = 6 / 111_320; // ~6 m
const OUT = join(process.cwd(), "src", "lib", "data", "rail-detail.json");

type Pt = [number, number];
interface Way { tags?: Record<string, string>; geometry?: { lon: number; lat: number }[] }

/** Douglas–Peucker on lon/lat (fine at Malaysia's latitude). */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}
function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

async function load(): Promise<Way[]> {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, "utf8")).elements;
  const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(QUERY) });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  return (await res.json()).elements;
}

const ways = await load();
let before = 0, after = 0;
// One MultiLineString per kind: 4 features instead of 3,500 keeps the file small
const byKind = new Map<string, Pt[][]>();
for (const w of ways) {
  if (!w.geometry || w.geometry.length < 2) continue;
  const raw: Pt[] = w.geometry.map((g) => [g.lon, g.lat]);
  const pts = simplify(raw, TOLERANCE_DEG).map(([x, y]): Pt => [+x.toFixed(5), +y.toFixed(5)]);
  before += raw.length; after += pts.length;
  const kind = w.tags?.railway ?? "rail";
  byKind.set(kind, [...(byKind.get(kind) ?? []), pts]);
}
const fc = {
  type: "FeatureCollection",
  features: [...byKind].map(([kind, lines]) => ({ type: "Feature", properties: { kind }, geometry: { type: "MultiLineString", coordinates: lines } })),
};
writeFileSync(OUT, JSON.stringify(fc));
console.log(`ways ${ways.length}, points ${before} → ${after}, ${(readFileSync(OUT).length / 1024).toFixed(0)} KB → ${OUT}`);

// Builds src/lib/data/population-hex.json: a GeoJSON FeatureCollection of
// H3 res-5 hexagons over Malaysia, each with an integer `pop` property, for a
// MapLibre fill-extrusion layer.
//
// Source: Kontur Population Malaysia (400m H3 res-8 hexagons) from HDX,
//   https://data.humdata.org/dataset/kontur-population-malaysia
//   -> kontur_population_MY_20231101.gpkg.gz (gunzip first).
// The GeoPackage is SQLite: table `population`, columns `h3` (text) and
// `population` (real). Cells are summed up to res 5, rounded to 4 decimals,
// and cells with pop < 50 are dropped to keep the file small.
//
// Run: npx tsx scripts/build-population-hex.ts <path-to-gpkg>

import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { cellToBoundary, cellToParent } from "h3-js";

const RES = 5;
const MIN_POP = 50;
const OUT = "src/lib/data/population-hex.json";

const gpkg = process.argv[2];
if (!gpkg) throw new Error("usage: npx tsx scripts/build-population-hex.ts <path-to-gpkg>");

const db = new DatabaseSync(gpkg, { readOnly: true });
const rows = db.prepare("select h3, population from population").all() as {
  h3: string;
  population: number;
}[];

const byCell = new Map<string, number>();
for (const { h3, population } of rows) {
  const p = cellToParent(h3, RES);
  byCell.set(p, (byCell.get(p) ?? 0) + population);
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;
const features = [...byCell]
  .map(([cell, pop]) => ({ cell, pop: Math.round(pop) }))
  .filter(({ pop }) => pop >= MIN_POP)
  .map(({ cell, pop }) => ({
    type: "Feature",
    properties: { pop },
    geometry: {
      type: "Polygon",
      coordinates: [cellToBoundary(cell, true).map(([lng, lat]) => [round(lng), round(lat)])],
    },
  }));

writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));

const total = features.reduce((s, f) => s + f.properties.pop, 0);
console.log(
  `${OUT}: ${features.length} cells from ${rows.length} rows, total pop ${total} ` +
    `(source ${Math.round(rows.reduce((s, r) => s + r.population, 0))})`,
);

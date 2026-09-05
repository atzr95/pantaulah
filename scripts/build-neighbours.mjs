// Builds src/lib/data/neighbours.json: dim land context around Malaysia
// (Sumatra, south Thailand, Singapore, Kalimantan, Brunei, Palawan...).
// Source: Natural Earth 50m via world-atlas. One-off; the helper packages are not project deps:
//   npm i --prefix /tmp/nb @turf/bbox-clip topojson-server topojson-simplify topojson-client
//   NODE_PATH=/tmp/nb/node_modules node scripts/build-neighbours.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
const require = createRequire(import.meta.url);
const bboxClip = require("@turf/bbox-clip").default ?? require("@turf/bbox-clip");
const { topology } = require("topojson-server");
const { presimplify, simplify, quantile } = require("topojson-simplify");

const BBOX = [93, -5, 123, 15]; // lon/lat window: wide enough for both map panels
const MALAYSIA_ID = "458";

const world = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json")).json();
const countries = feature(world, world.objects.countries).features;

const clipped = [];
for (const f of countries) {
  if (f.id === MALAYSIA_ID) continue;
  const c = bboxClip(f, BBOX);
  const coords = c.geometry?.coordinates ?? [];
  const nonEmpty = c.geometry.type === "Polygon" ? coords.length > 0 : coords.some((p) => p.length > 0);
  if (!nonEmpty) continue;
  clipped.push({ type: "Feature", properties: { name: f.properties.name }, geometry: c.geometry });
}

let topo = topology({ land: { type: "FeatureCollection", features: clipped } }, 1e4);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.35)); // keep coastlines readable, drop noise
writeFileSync("src/lib/data/neighbours.json", JSON.stringify(topo));
console.log("countries:", clipped.map((f) => f.properties.name).join(", "));

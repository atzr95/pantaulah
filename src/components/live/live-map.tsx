"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, LngLatLike, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Flight } from "@/lib/hooks/use-flights";
import type { TransitVehicle } from "@/lib/hooks/use-transit";
import type { EarthquakeEntry } from "@/lib/data/weather-types";
import railDetail from "@/lib/data/rail-detail.json";
import populationHex from "@/lib/data/population-hex.json";
import { CYAN, cyanAlpha, POI_COLORS } from "@/lib/ui/colors";
import {
  BASEMAP_STYLE, TERRAIN_TILES, SATELLITE_TILES, SATELLITE_ATTRIBUTION,
  NIGHT_LIGHTS_TILES, hazeTiles, HAZE_MAX_LAG_DAYS, GIBS_ATTRIBUTION, radarTile,
  type RadarFrame,
} from "@/lib/live/tiles";
import { renderField, gridCorners, smogColor, cloudColor, windArrows, type LiveGrid } from "@/lib/live/grid-field";
import { WindParticles } from "@/lib/live/wind-particles";
import { nightPolygon } from "@/lib/live/terminator";
import { railNetwork, snapToRail } from "@/lib/live/rail-snap";
import { distanceMetres, lineNetwork, pathOnNetwork, pointAlongNetwork, snapToNetwork, type LineNetwork, type NetworkLine, type Point } from "@/lib/live/line-snap";
import { joinTrail, motionPath, sampleMotion } from "@/lib/live/transit-motion";
import { fetchBusPath } from "@/lib/live/bus-path";
import { treeLossTiles, ENVIRONMENT_COLORS, FIRE_HEAT, type RiverStation, type Shelter, type FireDetection, type EnvironmentSelection } from "@/lib/data/environment";

export type LayerKey =
  | "radar" | "smog" | "cloud" | "wind" | "night" | "haze" | "terminator"
  | "flights" | "transit" | "rail" | "cctv" | "news" | "quakes" | "pop" | "buildings" | "terrain"
  | "rivers" | "shelters" | "fires" | "treeLoss";

export type Basemap = "dark" | "satellite";

export interface NewsPin { name: string; lat: number; lon: number; headlines: { title: string; link: string; source: string }[] }
export interface CctvPin { name: string; lat: number; lon: number; highway: string; image: string; approx?: boolean }

export type Selection =
  | EnvironmentSelection
  | { kind: "flight"; data: Flight }
  | { kind: "transit"; data: TransitVehicle }
  | { kind: "cctv"; data: CctvPin }
  | { kind: "news"; data: NewsPin }
  | { kind: "quake"; data: EarthquakeEntry }
  | { kind: "pop"; data: { pop: number } };

interface Props {
  layers: Partial<Record<LayerKey, boolean>>;
  basemap: Basemap;
  hour: number;
  grid: LiveGrid | null;
  radar: { host: string; frames: RadarFrame[] } | null;
  radarIndex: number;
  flights: Flight[];
  transit: TransitVehicle[];
  quakes: EarthquakeEntry[];
  news: NewsPin[];
  cctv: CctvPin[];
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
  onReady?: () => void;
  /** True while tiles for a newly chosen tree-loss year are loading. */
  onTreeLossLoading?: (loading: boolean) => void;
  rivers?: RiverStation[];
  shelters?: Shelter[];
  fires?: FireDetection[];
  treeYear?: number;
  followKey?: string | null;
}

// Tall phone maps need room above/below Malaysia to fit both regions at once.
const MALAYSIA_BOUNDS: [LngLatLike, LngLatLike] = [[94, -40], [126, 45]];
/** Data layers go below this style layer so place labels stay readable. */
const LABELS_ANCHOR = "highway_name_other";
/** Imagery goes here: above land/water fills, below rivers, roads and labels. */
const IMAGERY_ANCHOR = "waterway";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const toFC = <T,>(items: T[], pt: (t: T) => [number, number], props: (t: T) => Record<string, unknown>): FeatureCollection => ({
  type: "FeatureCollection",
  features: items.map((it) => ({ type: "Feature", geometry: { type: "Point", coordinates: pt(it) }, properties: props(it) })),
});

/** Map icon drawn on a 40×40 canvas with the origin at the centre, returned as ImageData for map.addImage. */
function canvasIcon(draw: (ctx: CanvasRenderingContext2D) => void, size = 40): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 40, size / 40);
  draw(ctx);
  return ctx.getImageData(0, 0, size, size);
}

const ICON_OUTLINE = "#071015";

/** Plane silhouette, nose up; fuselage + swept wings + tail. */
const planeIcon = (color: string) => canvasIcon((ctx) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -17); ctx.lineTo(2.5, -12); ctx.lineTo(2.5, -4); ctx.lineTo(16, 4); ctx.lineTo(16, 7);
  ctx.lineTo(2.5, 3); ctx.lineTo(2.5, 11); ctx.lineTo(7, 14); ctx.lineTo(7, 16); ctx.lineTo(0, 14);
  ctx.lineTo(-7, 16); ctx.lineTo(-7, 14); ctx.lineTo(-2.5, 11); ctx.lineTo(-2.5, 3); ctx.lineTo(-16, 7);
  ctx.lineTo(-16, 4); ctx.lineTo(-2.5, -4); ctx.lineTo(-2.5, -12); ctx.closePath();
  ctx.fill();
});

/** Glowing water drop for a river above its normal level. */
const dropIcon = (color: string) => canvasIcon((ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -16); ctx.bezierCurveTo(4, -9, 11, -3, 11, 4);
  ctx.arc(0, 4, 11, 0, Math.PI); ctx.bezierCurveTo(-11, -3, -4, -9, 0, -16);
  ctx.closePath();
  ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = ICON_OUTLINE; ctx.stroke();
});

/** House for an open relief shelter. */
const houseIcon = (color: string) => canvasIcon((ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -15); ctx.lineTo(15, -1); ctx.lineTo(10, -1); ctx.lineTo(10, 14);
  ctx.lineTo(-10, 14); ctx.lineTo(-10, -1); ctx.lineTo(-15, -1); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = ICON_OUTLINE; ctx.fillRect(-3, 4, 6, 10);
});

/** Security camera on a short pole, lens to the right. */
const cameraIcon = (color: string) => canvasIcon((ctx) => {
  ctx.fillStyle = color; ctx.strokeStyle = ICON_OUTLINE; ctx.lineWidth = 2;
  ctx.fillRect(-8, 4, 3, 11);
  ctx.beginPath(); ctx.roundRect(-14, -9, 20, 14, 3); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(15, -9); ctx.lineTo(15, 5); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
});

/** Bus seen from the front: body, windscreen, wheels. */
const busIcon = (color: string) => canvasIcon((ctx) => {
  ctx.fillStyle = color; ctx.strokeStyle = ICON_OUTLINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-11, -15, 22, 26, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ICON_OUTLINE; ctx.fillRect(-8, -11, 16, 9);
  for (const x of [-6, 6]) { ctx.beginPath(); ctx.arc(x, 13, 3, 0, 2 * Math.PI); ctx.fill(); }
});

/** Train seen from the front: rounded nose, window, lights, rails. */
/** White arrow pointing north; the map rotates it to where the wind blows. */
const arrowIcon = () => canvasIcon((ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -17); ctx.lineTo(10, -3); ctx.lineTo(3.5, -3); ctx.lineTo(3.5, 16);
  ctx.lineTo(-3.5, 16); ctx.lineTo(-3.5, -3); ctx.lineTo(-10, -3); ctx.closePath();
  ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ICON_OUTLINE; ctx.stroke();
});

const trainIcon = (color: string) => canvasIcon((ctx) => {
  ctx.fillStyle = color; ctx.strokeStyle = ICON_OUTLINE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-11, -16, 22, 26, [10, 10, 3, 3]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ICON_OUTLINE; ctx.fillRect(-7, -10, 14, 8); ctx.fillRect(-7, 3, 3, 3); ctx.fillRect(4, 3, 3, 3);
  ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(-9, 17); ctx.lineTo(-5, 11); ctx.moveTo(9, 17); ctx.lineTo(5, 11); ctx.stroke();
});

/** Target brackets drawn around the selected object (cyan corners). */
function reticleIcon(size = 64): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const m = 6, L = size * 0.3, e = size - m;
  ctx.strokeStyle = CYAN; ctx.lineWidth = 3; ctx.lineCap = "round";
  const corner = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
  };
  corner(m, m, 1, 1); corner(e, m, -1, 1); corner(m, e, 1, -1); corner(e, e, -1, -1);
  return ctx.getImageData(0, 0, size, size);
}

/** Current lon/lat of a selection, following live objects as they move. */
function selectionPoint(sel: Selection | null, flights: Flight[], transit: TransitVehicle[]): [number, number] | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "flight": { const f = flights.find((x) => x.icao24 === sel.data.icao24) ?? sel.data; return [f.lon, f.lat]; }
    case "transit": { const v = transit.find((x) => x.feed === sel.data.feed && x.id === sel.data.id) ?? sel.data; return [v.lon, v.lat]; }
    case "pop": return null;
    default: return [sel.data.lon, sel.data.lat];
  }
}

/** Zoom below which vehicles are dots; at/above they become 3D boxes. */
const VEHICLE_3D_MINZOOM = 11;

/**
 * Vehicle footprints as polygons for a fill-extrusion layer: a bus is one box,
 * a train is three coupled cars. Real metres once zoomed right in; below that
 * the boxes are scaled up so they stay visible (rebuilt on zoomend).
 */
function vehicleFootprints(vehicles: TransitVehicle[], zoom: number): FeatureCollection {
  // Boxes never drop below a minimum on-screen size: a bus is ≥16 px long at z≤12,
  // growing to ≥40 px by z16 (real 12 m takes over past ~z18); width ≥4–11 px likewise.
  const metresPerPx = (78_271 * Math.cos((4 * Math.PI) / 180)) / Math.pow(2, zoom); // MapLibre zoom is for 512 px tiles
  const t = Math.max(0, Math.min(1, (zoom - 12) / 4));
  const minBusPx = 16 + t * 24, minHalfWPx = (4 + t * 7) / 2;
  const features: Feature<Geometry>[] = [];
  for (const v of vehicles) {
    const train = v.type === "train";
    const realLen = train ? 70 : 12, realHalfW = train ? 1.6 : 1.3, realH = train ? 4 : 3.3;
    const scale = Math.max(1, ((train ? minBusPx * 2.1 : minBusPx) * metresPerPx) / realLen);
    const halfW = Math.max(realHalfW * scale, minHalfWPx * metresPerPx);
    const track = train ? snapToRail(v.lon, v.lat) : null;
    const b = (v.bearing * Math.PI) / 180;
    const mLat = 1 / 111_320, mLon = 1 / (111_320 * Math.cos((v.lat * Math.PI) / 180));
    // (forward, right) metres → lon/lat; forward is pre-scaled, width already in metres
    const pt = (f: number, r: number): [number, number] => [
      v.lon + (f * scale * Math.sin(b) + r * Math.cos(b)) * mLon,
      v.lat + (f * scale * Math.cos(b) - r * Math.sin(b)) * mLat,
    ];
    const box = (f0: number, f1: number) => {
      const a = track ? pointAlongNetwork(railNetwork, track, f0 * scale) : pt(f0, 0);
      const z = track ? pointAlongNetwork(railNetwork, track, f1 * scale) : pt(f1, 0);
      const heading = Math.atan2((z[0] - a[0]) / mLon, (z[1] - a[1]) / mLat);
      const dx = Math.cos(heading) * halfW * mLon, dy = -Math.sin(heading) * halfW * mLat;
      return [[a[0] - dx, a[1] - dy], [z[0] - dx, z[1] - dy], [z[0] + dx, z[1] + dy], [a[0] + dx, a[1] + dy], [a[0] - dx, a[1] - dy]];
    };
    const segments = train ? [[-35, -13], [-11, 11], [13, 35]] : [[-6, 6]];
    for (const [f0, f1] of segments) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [box(f0, f1)] },
        properties: { key: `${v.feed}::${v.id}`, type: v.type, height: realH * scale, __data: JSON.stringify(v) },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Style-layer ids toggled per LayerKey. */
const LAYER_IDS: Record<LayerKey, string[]> = {
  radar: ["radar"],
  smog: ["smog"], cloud: ["cloud"], wind: ["wind-arrows"], night: ["night"], haze: ["haze"],
  terminator: ["terminator"], flights: ["flights", "flights-mil"], transit: ["transit", "transit-icon", "transit-follow", "transit-follow-icon"], rail: ["rail"],
  cctv: ["cctv"], news: ["news", "news-count"], quakes: ["quakes", "quakes-ring"],
  pop: ["pop"], buildings: ["buildings"], terrain: ["hillshade"], // terrain itself is toggled via setTerrain
  rivers: ["rivers", "rivers-alert"], shelters: ["shelters"], fires: ["fires-heat", "fires"], treeLoss: ["tree-loss"],
};

export default function LiveMap(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const windRef = useRef<WindParticles | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [displayTransit, setDisplayTransit] = useState<TransitVehicle[]>([]);
  const [roadVersion, setRoadVersion] = useState(0);
  const [routeVersion, setRouteVersion] = useState(0);
  // "failed" = no WebGL, or the basemap style never loaded (shown as an overlay)
  const [failed, setFailed] = useState(false);
  // Days of lag for the haze layer: NASA publishes daily, and not always by tomorrow
  const hazeLag = useRef(1);
  const hazeUrl = useRef("");
  const roadsRef = useRef<LineNetwork | null>(null);
  const roadCache = useRef(new Map<string, { line: NetworkLine; seen: number }>());
  const trail = useRef<{ key: string; focused: boolean; legs: { points: Point[]; time: number }[] }>({ key: "", focused: false, legs: [] });
  const motion = useRef<{ vehicle: TransitVehicle; path: ReturnType<typeof motionPath>; bearing: number; started: number; duration: number } | null>(null);
  const busRequest = useRef<AbortController | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  // Point the haze source at the date implied by hazeLag (no-op when unchanged)
  const setHazeTiles = (m: MLMap) => {
    const url = hazeTiles(hazeLag.current);
    if (url === hazeUrl.current) return;
    hazeUrl.current = url;
    (m.getSource("haze") as maplibregl.RasterTileSource | undefined)?.setTiles([url]);
  };

  // ── Create map once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        center: [108.5, 4.2],
        zoom: 5.2,
        pitch: 0, // start flat; users tilt with right-drag / two fingers
        bearing: 0,
        minZoom: 3.5,
        maxZoom: 19, // Esri imagery goes this deep
        maxPitch: 60, // steeper pitch = many more tiles per frame
        maxBounds: MALAYSIA_BOUNDS,
        // Open-Meteo terms require visible credit for its forecast and CAMS air-quality data
        attributionControl: { compact: true, customAttribution: '<a href="https://open-meteo.com">Open-Meteo</a> · <a href="https://atmosphere.copernicus.eu">CAMS</a> · <a href="https://routing.openstreetmap.de/about.html">Road paths: FOSSGIS / OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>' },
      });
    } catch (e) {
      // MapLibre throws when it cannot get a WebGL context
      console.error("[live-map] WebGL init failed", e);
      setFailed(true);
      return;
    }
    // If the style still hasn't loaded after 20 s the basemap host is down or blocked
    const failTimer = setTimeout(() => { if (!map.loaded()) setFailed(true); }, 20_000);
    map.once("load", () => clearTimeout(failTimer));
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __liveMap: MLMap }).__liveMap = map; // dev console access
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      map.fitBounds([[99.3, 0.8], [119.7, 7.5]], { padding: 24, maxZoom: 5.2, duration: 0 });
      // Terminal palette over the OpenFreeMap dark style
      map.setPaintProperty("background", "background-color", "#071015");
      map.setPaintProperty("water", "fill-color", "#0b1c25");
      for (const id of ["boundary_state", "boundary_country_z5-"]) {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-color", cyanAlpha(0.35));
      }
      // The stock dark style's labels are dim grey; lift them and add a dark halo
      for (const l of map.getStyle().layers) {
        if (l.type !== "symbol" || !(l.layout as Record<string, unknown> | undefined)?.["text-field"]) continue;
        map.setPaintProperty(l.id, "text-color", "#d6e2e8");
        map.setPaintProperty(l.id, "text-halo-color", "rgba(7,16,21,0.9)");
        map.setPaintProperty(l.id, "text-halo-width", 1.4);
      }

      // Terrain + hillshade (AWS Terrarium, free)
      // Terrain is opt-in (the TERRAIN layer): it is by far the most expensive thing to pan/tilt.
      map.addSource("terrain", { type: "raster-dem", tiles: [TERRAIN_TILES], encoding: "terrarium", tileSize: 256, maxzoom: 14 });
      // 30 m DEM warps imagery over city blocks, so relief fades out as you zoom into a city
      const terrainExaggeration = () => {
        const z = map.getZoom();
        return z <= 10 ? 1.3 : z >= 14 ? 0.15 : 1.3 - ((z - 10) / 4) * 1.15;
      };
      map.on("zoomend", () => { if (map.getTerrain()) map.setTerrain({ source: "terrain", exaggeration: terrainExaggeration() }); });
      map.addLayer({ id: "hillshade", type: "hillshade", source: "terrain", layout: { visibility: "none" }, paint: { "hillshade-shadow-color": "#000", "hillshade-highlight-color": "#1e3a44", "hillshade-exaggeration": 0.35 } }, IMAGERY_ANCHOR);

      // Imagery rasters (hidden until toggled)
      // tileSize 128 for 256 px tiles makes MapLibre fetch one zoom level deeper, so
      // imagery is drawn at 2× density instead of upscaled and blurry on retina screens.
      const raster = (id: string, tiles: string, opts: Partial<maplibregl.RasterSourceSpecification> & { attribution?: string }, paint: maplibregl.RasterLayerSpecification["paint"], before = IMAGERY_ANCHOR) => {
        map.addSource(id, { type: "raster", tiles: [tiles], tileSize: 128, ...opts });
        map.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" }, paint: { "raster-fade-duration": 200, ...paint } }, before);
      };
      raster("satellite", SATELLITE_TILES, { attribution: SATELLITE_ATTRIBUTION, maxzoom: 18 }, { "raster-saturation": -0.1 });
      raster("night", NIGHT_LIGHTS_TILES, { attribution: GIBS_ATTRIBUTION, maxzoom: 8 }, { "raster-opacity": 0.9, "raster-contrast": 0.2 });
      raster("tree-loss", treeLossTiles(propsRef.current.treeYear ?? 2025), { tileSize: 512, maxzoom: 14, attribution: '<a href="https://www.globalforestwatch.org">Global Forest Watch / UMD</a>' }, { "raster-opacity": 0.9 }, LABELS_ANCHOR);
      hazeUrl.current = hazeTiles(hazeLag.current);
      raster("haze", hazeUrl.current, { attribution: GIBS_ATTRIBUTION, maxzoom: 6 }, { "raster-opacity": 0.7 }, LABELS_ANCHOR);

      // Model rasters (smog / cloud) painted from the Open-Meteo grid
      for (const id of ["smog", "cloud"]) {
        map.addSource(id, { type: "image", url: TRANSPARENT_PX, coordinates: [[99, 8.25], [120, 8.25], [120, 0], [99, 0]] });
        // Coarse 1.25° model fields: fade out as the user zooms into a city so the smear doesn't dominate
        const peak = id === "smog" ? 0.85 : 0.65;
        map.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" }, paint: { "raster-fade-duration": 0, "raster-resampling": "linear", "raster-opacity": ["interpolate", ["linear"], ["zoom"], 7, peak, 11, peak * 0.35] } }, LABELS_ANCHOR);
      }

      // Day/night shadow
      map.addSource("terminator", { type: "geojson", data: nightPolygon() });
      map.addLayer({ id: "terminator", type: "fill", source: "terminator", layout: { visibility: "none" }, paint: { "fill-color": "#000814", "fill-opacity": 0.45 } }, LABELS_ANCHOR);

      // Population towers (Kontur, H3 res 5)
      map.addSource("pop", { type: "geojson", data: populationHex as FeatureCollection });
      map.addLayer({
        // Country-scale layer only: at city zoom the towers would bury the streets
        id: "pop", type: "fill-extrusion", source: "pop", maxzoom: 10, layout: { visibility: "none" },
        paint: {
          "fill-extrusion-height": ["*", ["sqrt", ["get", "pop"]], 9],
          "fill-extrusion-color": ["interpolate", ["linear"], ["get", "pop"], 100, "#0e3a47", 10000, "#1a8ea3", 100000, CYAN, 1000000, "#e9fdff"],
          "fill-extrusion-opacity": 0.75,
        },
      }, LABELS_ANCHOR);

      // 3D buildings from the basemap's own vector tiles
      map.addLayer({
        id: "buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#132129", 60, "#1f4b5a", 200, CYAN],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      }, LABELS_ANCHOR);

      // Rail lines: detailed OSM geometry (~6 m), coloured by kind
      map.addSource("rail", { type: "geojson", data: railDetail as FeatureCollection });
      map.addLayer({
        id: "rail", type: "line", source: "rail", layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "kind"], "monorail", "#4ade80", "light_rail", "#a78bfa", "subway", "#a78bfa", "#e2e8f0"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 2, 16, 5, 19, 9],
          "line-opacity": 0.8,
        },
      }, LABELS_ANCHOR);

      // Live point layers (on top of everything)
      const geo = (id: string, attribution?: string) => map.addSource(id, { type: "geojson", data: EMPTY, attribution });
      geo("flights"); geo("transit"); geo("cctv"); geo("news"); geo("quakes");
      geo("rivers", "JPS InfoBanjir"); geo("shelters", "JKM InfoBencana"); geo("vehicle-trail"); geo("wind-arrows");
      map.addSource("fires", { type: "geojson", data: EMPTY, attribution: "NASA FIRMS / NOAA-20" });
      map.addLayer({ id: "vehicle-trail", type: "line", source: "vehicle-trail", paint: { "line-color": CYAN, "line-width": 3, "line-opacity": 0.8, "line-dasharray": [2, 2] } });

      map.addImage("reticle", reticleIcon());
      geo("selection");
      map.addImage("plane", planeIcon(POI_COLORS.flight));
      map.addImage("plane-mil", planeIcon("#ffbd5a"));
      // "live-" prefix: the basemap sprite already uses names like "shelter" and "bus", and addImage refuses a taken name.
      for (const status of ["Alert", "Warning", "Danger"] as const) map.addImage(`live-drop-${status}`, dropIcon(ENVIRONMENT_COLORS[status]));
      map.addImage("live-shelter", houseIcon("#a78bfa"));
      map.addImage("live-cctv", cameraIcon("#4ddd92"));
      map.addImage("live-bus", busIcon(POI_COLORS.bus));
      map.addImage("live-train", trainIcon(POI_COLORS.train));
      map.addImage("live-arrow", arrowIcon());
      const icon = (layout: maplibregl.SymbolLayerSpecification["layout"]): maplibregl.SymbolLayerSpecification["layout"] => ({ "icon-allow-overlap": true, "icon-ignore-placement": true, ...layout });

      // Fires: a heat glow where detections are dense; from z9 it fades into dots you can tap.
      map.addLayer({
        id: "fires-heat", type: "heatmap", source: "fires", maxzoom: 11,
        paint: {
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 14],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.15, 9, 0.8],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.05, `${FIRE_HEAT[0]}80`, 0.35, FIRE_HEAT[1], 0.85, FIRE_HEAT[2]],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.75, 11, 0],
        },
      });
      map.addLayer({ id: "fires", type: "circle", source: "fires", minzoom: 9, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6], "circle-color": FIRE_HEAT[1], "circle-stroke-color": FIRE_HEAT[0], "circle-stroke-width": 1, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 10, 0.95] } });

      // Wind arrows point where air (and smoke) is going; bigger = stronger. Calm points get none.
      map.addLayer({
        id: "wind-arrows", type: "symbol", source: "wind-arrows", filter: [">=", ["get", "speed"], 2],
        layout: icon({ "icon-image": "live-arrow", "icon-rotate": ["get", "to"], "icon-rotation-alignment": "map", "icon-size": ["interpolate", ["linear"], ["get", "speed"], 2, 0.35, 15, 0.6, 35, 0.9] }),
        paint: { "icon-opacity": 0.85 },
      });

      // Rivers: Normal/Unknown stay small and faint; raised levels get a glowing drop, worst on top.
      map.addLayer({ id: "rivers", type: "circle", source: "rivers", filter: ["in", ["get", "status"], ["literal", ["Normal", "Unknown"]]], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 10, 4], "circle-color": ["match", ["get", "status"], "Unknown", ENVIRONMENT_COLORS.Unknown, ENVIRONMENT_COLORS.Normal], "circle-opacity": 0.7 } });
      map.addLayer({ id: "rivers-alert", type: "symbol", source: "rivers", filter: ["in", ["get", "status"], ["literal", ["Alert", "Warning", "Danger"]]], layout: icon({ "icon-image": ["concat", "live-drop-", ["get", "status"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 0.8], "symbol-sort-key": ["match", ["get", "status"], "Danger", 3, "Warning", 2, 1] }) });

      // Shelters: bigger house = more people staying there.
      map.addLayer({ id: "shelters", type: "symbol", source: "shelters", layout: icon({ "icon-image": "live-shelter", "icon-size": ["interpolate", ["linear"], ["get", "people"], 0, 0.55, 100, 0.75, 1000, 1] }) });
      const planeLayout = (icon: string): maplibregl.SymbolLayerSpecification["layout"] => ({
        "icon-image": icon, "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 10, 0.9],
        "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
      });
      map.addLayer({ id: "flights", type: "symbol", source: "flights", filter: ["!", ["get", "military"]], layout: planeLayout("plane") });
      map.addLayer({ id: "flights-mil", type: "symbol", source: "flights", filter: ["get", "military"], layout: planeLayout("plane-mil") });

      // Far out: small bus/train icons. Zoomed in: 3D boxes shaped like the vehicle.
      map.addLayer({
        id: "transit-icon", type: "symbol", source: "transit", maxzoom: VEHICLE_3D_MINZOOM,
        layout: icon({ "icon-image": ["match", ["get", "type"], "train", "live-train", "live-bus"], "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 8, 0.35, 11, 0.55] }),
      });
      geo("transit-3d");
      map.addLayer({
        id: "transit", type: "fill-extrusion", source: "transit-3d", minzoom: VEHICLE_3D_MINZOOM,
        paint: {
          "fill-extrusion-color": ["match", ["get", "type"], "train", POI_COLORS.train, POI_COLORS.bus],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-opacity": 0.95,
        },
      });
      for (const [original, id, source] of [["transit-icon", "transit-follow-icon", "transit-follow-point"], ["transit", "transit-follow", "transit-follow-3d"]]) {
        geo(source);
        const layer = map.getStyle().layers.find((l) => l.id === original)!;
        map.addLayer({ ...layer, id, source } as maplibregl.LayerSpecification);
      }

      map.addLayer({ id: "quakes-ring", type: "circle", source: "quakes", paint: { "circle-radius": ["*", ["get", "magnitude"], 5], "circle-color": "rgba(255,107,114,0.15)", "circle-stroke-width": 1, "circle-stroke-color": "rgba(255,107,114,0.6)" } });
      map.addLayer({ id: "quakes", type: "circle", source: "quakes", paint: { "circle-radius": 4, "circle-color": "#ff6b72" } });

      map.addLayer({ id: "cctv", type: "symbol", source: "cctv", layout: icon({ "icon-image": "live-cctv", "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 10, 0.65] }) });

      map.addLayer({ id: "news", type: "circle", source: "news", paint: { "circle-radius": ["+", 8, ["*", ["sqrt", ["get", "count"]], 3]], "circle-color": cyanAlpha(0.18), "circle-stroke-width": 1, "circle-stroke-color": CYAN } });
      map.addLayer({ id: "news-count", type: "symbol", source: "news", layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#e9fdff" } });
      map.addLayer({
        id: "selection", type: "symbol", source: "selection",
        layout: { "icon-image": "reticle", "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 12, 0.8, 17, 1.1], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-pitch-alignment": "viewport" },
      });

      // Interaction
      // Top-most layer first: these listeners fire in this order and the first hit wins,
      // so a tap picks the icon drawn on top (a camera over a bus opens the camera).
      const clickable: { id: string; kind: Selection["kind"] }[] = [
        { id: "news", kind: "news" }, { id: "cctv", kind: "cctv" }, { id: "quakes-ring", kind: "quake" },
        { id: "transit-follow", kind: "transit" }, { id: "transit-follow-icon", kind: "transit" },
        { id: "transit", kind: "transit" }, { id: "transit-icon", kind: "transit" }, { id: "flights-mil", kind: "flight" }, { id: "flights", kind: "flight" },
        { id: "shelters", kind: "shelter" }, { id: "rivers-alert", kind: "river" }, { id: "rivers", kind: "river" }, { id: "fires", kind: "fire" }, { id: "pop", kind: "pop" },
      ];
      let handled = false;
      for (const { id, kind } of clickable) {
        map.on("click", id, (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const f = e.features?.[0];
          if (!f || handled) return;
          handled = true;
          const raw = f.properties?.__data ? JSON.parse(f.properties.__data as string) : f.properties;
          propsRef.current.onSelect({ kind, data: raw } as Selection);
        });
        map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
      }
      map.on("click", () => {
        if (!handled) propsRef.current.onSelect(null);
        handled = false;
      });

      windRef.current = new WindParticles(map, windCanvasRef.current!);
      setLoaded(true); // re-runs every prop effect below now that layers exist
      propsRef.current.onReady?.();
    });

    // No haze tiles for that date yet (GIBS answers 404): step back a day, up to a limit
    map.on("error", (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
      const status = (e.error as { status?: number } | undefined)?.status;
      if (e.sourceId !== "haze" || status !== 404 || hazeLag.current >= HAZE_MAX_LAG_DAYS) return;
      hazeLag.current += 1;
      setHazeTiles(map);
    });

    const terminatorTimer = setInterval(() => {
      const src = map.getSource("terminator") as maplibregl.GeoJSONSource | undefined;
      src?.setData(nightPolygon());
    }, 60_000);

    return () => {
      busRequest.current?.abort();
      clearInterval(terminatorTimer);
      clearTimeout(failTimer);
      windRef.current?.destroy();
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, []);

  // ── Prop-driven updates (no-ops until the style has loaded; `loaded` re-fires them) ──
  const ready = () => (loaded ? mapRef.current : null);

  useEffect(() => {
    const m = ready(); if (!m || !p.layers.treeLoss) return;
    const src = m.getSource("tree-loss") as maplibregl.RasterTileSource, url = treeLossTiles(p.treeYear ?? 2025);
    let poll: ReturnType<typeof setInterval> | undefined;
    // Wait for the slider to rest: each year is a new set of slow (~2 s) server-drawn tiles, and loading
    // every year passed while dragging queued them all and let late old-year tiles overwrite newer ones.
    const t = setTimeout(() => {
      if (src.tiles[0] !== url) src.setTiles([url]);
      propsRef.current.onTreeLossLoading?.(true);
      // Polled, not evented: the first sourcedata event after setTiles fires before the reload starts.
      poll = setInterval(() => {
        if (!m.isSourceLoaded("tree-loss")) return;
        clearInterval(poll);
        propsRef.current.onTreeLossLoading?.(false);
      }, 250);
    }, src.tiles[0] === url ? 0 : 400);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, [p.treeYear, p.layers.treeLoss, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const m = ready(); if (m) setData(m, "rivers", toFC(p.rivers ?? [], (r) => [r.lon, r.lat], (r) => ({ status: r.status, __data: JSON.stringify(r) }))); }, [p.rivers, loaded]);
  useEffect(() => { const m = ready(); if (m) setData(m, "shelters", toFC(p.shelters ?? [], (s) => [s.lon, s.lat], (s) => ({ people: s.people, __data: JSON.stringify(s) }))); }, [p.shelters, loaded]);
  useEffect(() => { const m = ready(); if (m) setData(m, "fires", toFC(p.fires ?? [], (f) => [f.lon, f.lat], (f) => ({ __data: JSON.stringify(f) }))); }, [p.fires, loaded]);

  // Use one displayed position for the body, icon, selection, follow camera and trail.
  useEffect(() => {
    const m = ready(); if (!m) return;
    let timer: ReturnType<typeof setTimeout>;
    const match = () => {
      const bounds = m.getBounds();
      const lines = m.getZoom() >= 13 && (p.followKey || p.transit.some((v) => v.type === "bus" && bounds.contains([v.lon, v.lat]))) ? m.querySourceFeatures("openmaptiles", {
        sourceLayer: "transportation",
        filter: ["in", "class", "motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track", "busway"],
      }).flatMap((f) => {
        const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
        return lines.map((coordinates): NetworkLine => ({ coordinates, oneway: f.properties.oneway === 1 ? 1 : f.properties.oneway === -1 ? -1 : 0 }));
      }) : [];
      let roads: LineNetwork | null;
      if (p.followKey) {
        const now = Date.now();
        let changed = false;
        for (const line of lines) {
          const key = JSON.stringify(line.coordinates);
          if (roadCache.current.get(key)?.line.oneway !== line.oneway) changed = true;
          roadCache.current.set(key, { line, seen: now });
        }
        // Keep roads for the same ten minutes as the trail, including tiles now off screen.
        for (const [key, entry] of roadCache.current) if (now - entry.seen > 600_000) { roadCache.current.delete(key); changed = true; }
        roads = changed ? lineNetwork([...roadCache.current.values()].map((v) => v.line)) : roadsRef.current;
        if (changed) setRoadVersion((v) => v + 1);
      } else {
        roadCache.current.clear();
        roads = lines.length ? lineNetwork(lines) : null;
      }
      roadsRef.current = roads;
      const vehicles = p.transit.map((v) => {
        // shortcut: bus routes have no paths in this feed; use distance and direction until route shapes are available.
        const hit = v.type === "train" ? snapToRail(v.lon, v.lat) : roads && (bounds.contains([v.lon, v.lat]) || `${v.feed}::${v.id}` === p.followKey)
          ? snapToNetwork(roads, v.lon, v.lat, 40, v.speed > 3 ? v.bearing : undefined) : null;
        return hit ? { ...v, lon: hit.lon, lat: hit.lat, bearing: hit.bearing } : v;
      });
      setDisplayTransit((previous) => previous.length === vehicles.length && previous.every((v, i) => {
        const next = vehicles[i];
        return v.id === next.id && v.feed === next.feed && Math.abs(v.lon - next.lon) < 1e-9 && Math.abs(v.lat - next.lat) < 1e-9 && Math.abs(v.bearing - next.bearing) < 1e-6 && v.timestamp === next.timestamp && v.speed === next.speed && v.routeId === next.routeId && v.label === next.label;
      }) ? previous : vehicles);
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(match, 100); };
    const onSource = (event: maplibregl.MapSourceDataEvent) => {
      if (event.sourceId === "openmaptiles" && event.sourceDataType === "content") schedule();
    };
    match();
    m.on("moveend", schedule);
    m.on("sourcedata", onSource);
    return () => { clearTimeout(timer); m.off("moveend", schedule); m.off("sourcedata", onSource); };
  }, [p.transit, p.followKey, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = ready(); if (!m) return;
    const key = p.followKey ?? "";
    const changed = trail.current.key !== key;
    if (changed) { trail.current = { key, focused: false, legs: [] }; motion.current = null; }
    const displayed = displayTransit.find((v) => `${v.feed}::${v.id}` === key);
    const vehicle = displayed?.type === "bus" ? p.transit.find((v) => `${v.feed}::${v.id}` === key) : displayed;
    const fresh = vehicle && Date.now() / 1000 - vehicle.timestamp < 180;
    for (const id of ["transit", "transit-icon"]) m.setFilter(id, fresh ? ["!=", ["get", "key"], key] : null);
    if (!fresh) {
      busRequest.current?.abort(); busRequest.current = null;
      motion.current = null;
      setData(m, "transit-follow-point", EMPTY); setData(m, "transit-follow-3d", EMPTY); setData(m, "vehicle-trail", EMPTY);
      return;
    }
    const now = performance.now(), previous = motion.current;
    if (!previous || previous.vehicle.timestamp !== vehicle.timestamp || previous.vehicle.lon !== vehicle.lon || previous.vehicle.lat !== vehicle.lat) {
      busRequest.current?.abort(); busRequest.current = null;
      const current = previous ? sampleMotion(previous.path, previous.duration ? (now - previous.started) / previous.duration : 1) : null;
      if (current && previous) trail.current.legs.push({ points: current.trail, time: previous.vehicle.timestamp });
      const target: Point = [vehicle.lon, vehicle.lat];
      const network = vehicle.type === "train" ? railNetwork : null;
      const path = current && network && previous && vehicle.timestamp - previous.vehicle.timestamp <= 180 ? pathOnNetwork(network, current.point, target, 40) : null;
      const waiting = vehicle.type === "bus" && current && previous && vehicle.timestamp - previous.vehicle.timestamp <= 180 && distanceMetres(current.point, target) > 0.1;
      const position: Point = waiting ? current.point : !previous && displayed ? [displayed.lon, displayed.lat] : target;
      const displayBearing = waiting ? (previous.path.length ? current.bearing : previous.bearing) : displayed?.bearing ?? vehicle.bearing;
      motion.current = { vehicle, path: motionPath(path ?? [position]), bearing: displayBearing, started: now,
        duration: path ? Math.max(1000, Math.min(30_000, (vehicle.timestamp - previous!.vehicle.timestamp) * 1000)) : 0 };
      if (waiting) {
        const request = new AbortController();
        busRequest.current = request;
        const fromBearing = previous.vehicle.speed > 3 ? displayBearing : undefined;
        const toBearing = vehicle.speed > 3 ? vehicle.bearing : undefined;
        void fetchBusPath(current.point, target, [fromBearing, toBearing], request.signal).then((route) => {
          if (request.signal.aborted || busRequest.current !== request || propsRef.current.followKey !== key) return;
          busRequest.current = null;
          motion.current = { vehicle, path: motionPath(route ?? [target]), bearing: vehicle.bearing, started: performance.now(),
            duration: route ? Math.max(1000, Math.min(30_000, (vehicle.timestamp - previous.vehicle.timestamp) * 1000)) : 0 };
          setRouteVersion((v) => v + 1);
        });
      }
      trail.current.legs = trail.current.legs.filter((leg) => vehicle.timestamp - leg.time <= 600).slice(-60);
      if (!trail.current.focused) {
        trail.current.focused = true;
        m.easeTo({ center: position, bearing: displayBearing, zoom: Math.max(m.getZoom(), 18), pitch: 45, duration: 900 });
      } else if (!path && !waiting && !m.isMoving()) {
        m.easeTo({ center: target, bearing: vehicle.bearing, duration: 900 });
      }
    }
    // Join old pieces again when road tiles arrive, without drawing a line across a gap.
    const network = vehicle.type === "train" ? railNetwork : null;
    const history = joinTrail(network, [...trail.current.legs.map((leg) => leg.points), [motion.current!.path.points[0]]]);
    let frame = 0, lastFrame = -Infinity;
    const paint = () => {
      const state = motion.current!;
      const progress = state.duration ? Math.min(1, (performance.now() - state.started) / state.duration) : 1;
      const sample = sampleMotion(state.path, progress);
      const v = { ...state.vehicle, lon: sample.point[0], lat: sample.point[1], bearing: state.path.length ? sample.bearing : state.bearing };
      setData(m, "transit-follow-point", toFC([v], () => sample.point, () => ({ type: v.type, __data: JSON.stringify(v) })));
      setData(m, "transit-follow-3d", m.getZoom() >= VEHICLE_3D_MINZOOM ? vehicleFootprints([v], m.getZoom()) : EMPTY);
      const selection = propsRef.current.selection;
      if (selection?.kind === "transit" && `${selection.data.feed}::${selection.data.id}` === key) setData(m, "selection", toFC([v], () => sample.point, () => ({})));
      const legs = history.map((points) => [...points]);
      legs.at(-1)!.push(...sample.trail);
      const paths = legs.map((points) => points.filter((point, i) => !i || distanceMetres(points[i - 1], point) > 0.01)).filter((points) => points.length > 1);
      setData(m, "vehicle-trail", paths.length ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: paths } }] } : EMPTY);
      // jumpTo cancels map gestures, so let the user's zoom/pan finish before following again.
      if (m.isMoving()) return 0;
      const bearing = m.getBearing(), turn = ((v.bearing - bearing + 540) % 360) - 180;
      m.jumpTo({ center: sample.point, bearing: bearing + turn * 0.15 });
      if (progress === 1 && Math.abs(turn) > 0.5) return 0;
      return progress;
    };
    const animate = (time: number) => {
      if (time - lastFrame < 33) { frame = requestAnimationFrame(animate); return; }
      lastFrame = time;
      if (paint() < 1) frame = requestAnimationFrame(animate);
    };
    if (paint() < 1) frame = requestAnimationFrame(animate);
    const redraw = () => {
      if (paint() < 1) { cancelAnimationFrame(frame); frame = requestAnimationFrame(animate); }
    };
    m.on("zoomend", redraw);
    return () => { cancelAnimationFrame(frame); m.off("zoomend", redraw); };
  }, [p.followKey, p.transit, displayTransit, roadVersion, routeVersion, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Haze: re-derive the date when the layer is switched on and hourly while it is on,
  // so a tab left open across midnight UTC doesn't keep requesting an old day.
  useEffect(() => {
    const m = ready(); if (!m || !p.layers.haze) return;
    const refresh = () => { hazeLag.current = 1; setHazeTiles(m); };
    refresh();
    const t = setInterval(refresh, 3_600_000);
    return () => clearInterval(t);
  }, [p.layers.haze, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = ready(); if (!m) return;
    applyVisibility(m, p.layers);
    const z = m.getZoom();
    const exaggeration = z <= 10 ? 1.3 : z >= 14 ? 0.15 : 1.3 - ((z - 10) / 4) * 1.15;
    m.setTerrain(p.layers.terrain ? { source: "terrain", exaggeration } : null);
  }, [p.layers, loaded]);

  // Satellite mode: hide the basemap's own land, road and building drawing so the
  // photo is unobstructed; keep labels and boundaries; make 3D buildings see-through.
  useEffect(() => {
    const m = ready(); if (!m) return;
    const sat = p.basemap === "satellite";
    m.setLayoutProperty("satellite", "visibility", sat ? "visible" : "none");
    for (const l of m.getStyle().layers) {
      const isBasemapDrawing = (l.type === "fill" || l.type === "line") && l.source === "openmaptiles" && !l.id.startsWith("boundary");
      const ownData = ["rail", "terminator", "smog", "cloud"].includes(l.id);
      if (isBasemapDrawing && !ownData) m.setLayoutProperty(l.id, "visibility", sat ? "none" : "visible");
    }
    m.setPaintProperty("buildings", "fill-extrusion-opacity", sat ? 0.4 : 0.85);
  }, [p.basemap, loaded]);

  useEffect(() => {
    const m = ready(); if (!m || !p.grid) return;
    (m.getSource("smog") as maplibregl.ImageSource).updateImage({ url: renderField(p.grid, p.grid.pm25, p.hour, smogColor), coordinates: gridCorners(p.grid) });
    (m.getSource("cloud") as maplibregl.ImageSource).updateImage({ url: renderField(p.grid, p.grid.cloud, p.hour, cloudColor), coordinates: gridCorners(p.grid) });
    windRef.current?.setHour(p.hour);
    setData(m, "wind-arrows", toFC(windArrows(p.grid, p.hour), (a) => [a.lon, a.lat], (a) => ({ to: a.to, speed: a.speed })));
  }, [p.grid, p.hour, loaded]);

  useEffect(() => {
    const m = ready(); if (!m) return;
    const canvas = windCanvasRef.current!;
    const on = p.layers.wind && !!p.grid;
    canvas.style.display = on ? "block" : "none";
    if (on) windRef.current?.setData(p.grid!, p.hour);
    else windRef.current?.stop(); // don't burn CPU drawing into a hidden canvas
  }, [p.layers.wind, p.grid, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Radar: one raster source; swapping the tile URL shows a different frame.
  // ponytail: no per-frame layer stack — one layer, setTiles() on change.
  useEffect(() => {
    const m = ready(); if (!m) return;
    const frame = p.radar?.frames[p.radarIndex];
    if (!frame) return;
    const url = radarTile(p.radar!.host, frame.path);
    const src = m.getSource("radar") as maplibregl.RasterTileSource | undefined;
    if (src) {
      src.setTiles([url]);
    } else {
      m.addSource("radar", { type: "raster", tiles: [url], tileSize: 256, maxzoom: 7 /* RainViewer serves a placeholder above z7 */, attribution: "RainViewer" });
      m.addLayer({ id: "radar", type: "raster", source: "radar", maxzoom: 10, layout: { visibility: p.layers.radar ? "visible" : "none" }, paint: { "raster-opacity": 0.8, "raster-fade-duration": 150 } }, LABELS_ANCHOR);
    }
  }, [p.radar, p.radarIndex, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const m = ready(); if (m) setData(m, "flights", toFC(p.flights, (f) => [f.lon, f.lat], (f) => ({ heading: f.heading, military: !!f.military, __data: JSON.stringify(f) }))); }, [p.flights, loaded]);
  useEffect(() => {
    const m = ready(); if (!m) return;
    setData(m, "transit", toFC(displayTransit, (v) => [v.lon, v.lat], (v) => ({ key: `${v.feed}::${v.id}`, type: v.type, __data: JSON.stringify(v) })));
    const rebuild = () => { if (m.getZoom() >= VEHICLE_3D_MINZOOM - 0.5) setData(m, "transit-3d", vehicleFootprints(displayTransit, m.getZoom())); };
    rebuild();
    m.on("zoomend", rebuild);
    return () => { m.off("zoomend", rebuild); };
  }, [displayTransit, loaded]);
  useEffect(() => {
    const m = ready(); if (!m) return;
    if (p.selection?.kind === "transit" && p.followKey === `${p.selection.data.feed}::${p.selection.data.id}`) return;
    const pt = selectionPoint(p.selection, p.flights, displayTransit);
    setData(m, "selection", pt ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: {} }] } : EMPTY);
  }, [p.selection, p.followKey, p.flights, displayTransit, loaded]);
  useEffect(() => { const m = ready(); if (m) setData(m, "quakes", toFC(p.quakes, (q) => [q.lon, q.lat], (q) => ({ magnitude: q.magnitude, __data: JSON.stringify(q) }))); }, [p.quakes, loaded]);
  useEffect(() => { const m = ready(); if (m) setData(m, "news", toFC(p.news, (n) => [n.lon, n.lat], (n) => ({ count: n.headlines.length, __data: JSON.stringify(n) }))); }, [p.news, loaded]);
  useEffect(() => { const m = ready(); if (m) setData(m, "cctv", toFC(p.cctv, (c) => [c.lon, c.lat], (c) => ({ __data: JSON.stringify(c) }))); }, [p.cctv, loaded]);

  return (
    <div className="relative w-full h-full">
      {/* maplibre CSS forces position:relative on its container, so size it explicitly */}
      <div ref={containerRef} className="w-full h-full" />
      <canvas ref={windCanvasRef} className="absolute inset-0 pointer-events-none" style={{ display: "none" }} />
      {/* Loading / failure states; the map itself stays mounted underneath */}
      {(failed || !loaded) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-xs tracking-[0.08em] text-[var(--color-text-dim)]" style={{ background: failed ? "var(--color-bg)" : "transparent" }} role="status">
          {failed ? "MAP UNAVAILABLE · needs WebGL and access to tiles.openfreemap.org" : "LOADING MAP…"}
        </div>
      )}
    </div>
  );
}

function setData(m: MLMap, id: string, fc: FeatureCollection) {
  (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
}

function applyVisibility(m: MLMap, layers: Partial<Record<LayerKey, boolean>>) {
  for (const [key, ids] of Object.entries(LAYER_IDS) as [LayerKey, string[]][]) {
    for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", layers[key] ? "visible" : "none");
  }
}

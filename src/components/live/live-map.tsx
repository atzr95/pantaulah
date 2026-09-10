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
import { POI_COLORS } from "@/lib/ui/colors";
import {
  BASEMAP_STYLE, TERRAIN_TILES, SATELLITE_TILES, SATELLITE_ATTRIBUTION,
  NIGHT_LIGHTS_TILES, HAZE_AOD_TILES, GIBS_ATTRIBUTION, radarTile,
  type RadarFrame,
} from "@/lib/live/tiles";
import { renderField, gridCorners, smogColor, cloudColor, type LiveGrid } from "@/lib/live/grid-field";
import { WindParticles } from "@/lib/live/wind-particles";
import { nightPolygon } from "@/lib/live/terminator";
import { railBearingNear } from "@/lib/live/rail-snap";

export type LayerKey =
  | "radar" | "smog" | "cloud" | "wind" | "night" | "haze" | "terminator"
  | "flights" | "transit" | "rail" | "cctv" | "news" | "quakes" | "pop" | "buildings" | "terrain";

export type Basemap = "dark" | "satellite";

export interface NewsPin { name: string; lat: number; lon: number; headlines: { title: string; link: string; source: string }[] }
export interface CctvPin { name: string; lat: number; lon: number; highway: string; image: string; approx?: boolean }

export type Selection =
  | { kind: "flight"; data: Flight }
  | { kind: "transit"; data: TransitVehicle }
  | { kind: "cctv"; data: CctvPin }
  | { kind: "news"; data: NewsPin }
  | { kind: "quake"; data: EarthquakeEntry }
  | { kind: "pop"; data: { pop: number } };

interface Props {
  layers: Record<LayerKey, boolean>;
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
}

const MALAYSIA_BOUNDS: [LngLatLike, LngLatLike] = [[94, -4], [126, 12]];
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

/** Plane silhouette drawn on a canvas, returned as ImageData for map.addImage. */
function planeIcon(color: string, size = 40): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const s = size / 40;
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  // nose up; fuselage + swept wings + tail
  ctx.moveTo(0, -17); ctx.lineTo(2.5, -12); ctx.lineTo(2.5, -4); ctx.lineTo(16, 4); ctx.lineTo(16, 7);
  ctx.lineTo(2.5, 3); ctx.lineTo(2.5, 11); ctx.lineTo(7, 14); ctx.lineTo(7, 16); ctx.lineTo(0, 14);
  ctx.lineTo(-7, 16); ctx.lineTo(-7, 14); ctx.lineTo(-2.5, 11); ctx.lineTo(-2.5, 3); ctx.lineTo(-16, 7);
  ctx.lineTo(-16, 4); ctx.lineTo(-2.5, -4); ctx.lineTo(-2.5, -12); ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

/** Target brackets drawn around the selected object (cyan, glowing corners). */
function reticleIcon(size = 64): ImageData {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const m = 6, L = size * 0.3, e = size - m;
  ctx.strokeStyle = "#27d7ee"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.shadowColor = "rgba(39,215,238,0.9)"; ctx.shadowBlur = 8;
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
    // Trains follow the track; the feed's bearing is 0 while they sit at a platform
    const heading = train ? (railBearingNear(v.lon, v.lat) ?? v.bearing) : v.bearing;
    const b = (heading * Math.PI) / 180;
    const mLat = 1 / 111_320, mLon = 1 / (111_320 * Math.cos((v.lat * Math.PI) / 180));
    // (forward, right) metres → lon/lat; forward is pre-scaled, width already in metres
    const pt = (f: number, r: number): [number, number] => [
      v.lon + (f * scale * Math.sin(b) + r * Math.cos(b)) * mLon,
      v.lat + (f * scale * Math.cos(b) - r * Math.sin(b)) * mLat,
    ];
    const box = (f0: number, f1: number) => [pt(f0, -halfW), pt(f1, -halfW), pt(f1, halfW), pt(f0, halfW), pt(f0, -halfW)];
    const segments = train ? [[-35, -13], [-11, 11], [13, 35]] : [[-6, 6]];
    for (const [f0, f1] of segments) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [box(f0, f1)] },
        properties: { type: v.type, height: realH * scale, __data: JSON.stringify(v) },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Style-layer ids toggled per LayerKey. */
const LAYER_IDS: Record<LayerKey, string[]> = {
  radar: ["radar"],
  smog: ["smog"], cloud: ["cloud"], wind: [], night: ["night"], haze: ["haze"],
  terminator: ["terminator"], flights: ["flights", "flights-mil"], transit: ["transit", "transit-dot"], rail: ["rail"],
  cctv: ["cctv", "cctv-ring"], news: ["news", "news-count"], quakes: ["quakes", "quakes-ring"],
  pop: ["pop"], buildings: ["buildings"], terrain: ["hillshade"], // terrain itself is toggled via setTerrain
};

export default function LiveMap(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const windRef = useRef<WindParticles | null>(null);
  const [loaded, setLoaded] = useState(false);
  // "failed" = no WebGL, or the basemap style never loaded (shown as an overlay)
  const [failed, setFailed] = useState(false);
  const propsRef = useRef(p);
  propsRef.current = p;

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
        minZoom: 4.5,
        maxZoom: 19, // Esri imagery goes this deep
        maxPitch: 60, // steeper pitch = many more tiles per frame
        maxBounds: MALAYSIA_BOUNDS,
        // Open-Meteo terms require visible credit for its forecast and CAMS air-quality data
        attributionControl: { compact: true, customAttribution: '<a href="https://open-meteo.com">Open-Meteo</a> · <a href="https://atmosphere.copernicus.eu">CAMS</a>' },
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
      // Terminal palette over the OpenFreeMap dark style
      map.setPaintProperty("background", "background-color", "#071015");
      map.setPaintProperty("water", "fill-color", "#0b1c25");
      for (const id of ["boundary_state", "boundary_country_z5-"]) {
        if (map.getLayer(id)) map.setPaintProperty(id, "line-color", "rgba(39,215,238,0.35)");
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
      raster("haze", HAZE_AOD_TILES, { attribution: GIBS_ATTRIBUTION, maxzoom: 6 }, { "raster-opacity": 0.7 }, LABELS_ANCHOR);

      // Model rasters (smog / cloud) painted from the Open-Meteo grid
      for (const id of ["smog", "cloud"]) {
        map.addSource(id, { type: "image", url: TRANSPARENT_PX, coordinates: [[99, 8.25], [120, 8.25], [120, 0], [99, 0]] });
        // Coarse 0.75° model fields: fade out as the user zooms into a city so the smear doesn't dominate
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
          "fill-extrusion-color": ["interpolate", ["linear"], ["get", "pop"], 100, "#0e3a47", 10000, "#1a8ea3", 100000, "#27d7ee", 1000000, "#e9fdff"],
          "fill-extrusion-opacity": 0.75,
        },
      }, LABELS_ANCHOR);

      // 3D buildings from the basemap's own vector tiles
      map.addLayer({
        id: "buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#132129", 60, "#1f4b5a", 200, "#27d7ee"],
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
      const geo = (id: string) => map.addSource(id, { type: "geojson", data: EMPTY });
      geo("flights"); geo("transit"); geo("cctv"); geo("news"); geo("quakes");

      map.addImage("reticle", reticleIcon());
      geo("selection");
      map.addImage("plane", planeIcon(POI_COLORS.flight));
      map.addImage("plane-mil", planeIcon("#ffbd5a"));
      const planeLayout = (icon: string): maplibregl.SymbolLayerSpecification["layout"] => ({
        "icon-image": icon, "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 10, 0.9],
        "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
      });
      map.addLayer({ id: "flights", type: "symbol", source: "flights", filter: ["!", ["get", "military"]], layout: planeLayout("plane") });
      map.addLayer({ id: "flights-mil", type: "symbol", source: "flights", filter: ["get", "military"], layout: planeLayout("plane-mil") });

      // Far out: coloured dots. Zoomed in: 3D boxes shaped like the vehicle.
      map.addLayer({
        id: "transit-dot", type: "circle", source: "transit", maxzoom: VEHICLE_3D_MINZOOM,
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 11, 4], "circle-color": ["match", ["get", "type"], "train", POI_COLORS.train, POI_COLORS.bus], "circle-stroke-width": 0.5, "circle-stroke-color": "#071015" },
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

      map.addLayer({ id: "quakes-ring", type: "circle", source: "quakes", paint: { "circle-radius": ["*", ["get", "magnitude"], 5], "circle-color": "rgba(255,107,114,0.15)", "circle-stroke-width": 1, "circle-stroke-color": "rgba(255,107,114,0.6)" } });
      map.addLayer({ id: "quakes", type: "circle", source: "quakes", paint: { "circle-radius": 4, "circle-color": "#ff6b72" } });

      map.addLayer({ id: "cctv-ring", type: "circle", source: "cctv", paint: { "circle-radius": 9, "circle-color": "rgba(77,221,146,0.12)", "circle-stroke-width": 1, "circle-stroke-color": "rgba(77,221,146,0.7)" } });
      map.addLayer({ id: "cctv", type: "circle", source: "cctv", paint: { "circle-radius": 3, "circle-color": "#4ddd92" } });

      map.addLayer({ id: "news", type: "circle", source: "news", paint: { "circle-radius": ["+", 8, ["*", ["sqrt", ["get", "count"]], 3]], "circle-color": "rgba(39,215,238,0.18)", "circle-stroke-width": 1, "circle-stroke-color": "#27d7ee" } });
      map.addLayer({ id: "news-count", type: "symbol", source: "news", layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#e9fdff" } });
      map.addLayer({
        id: "selection", type: "symbol", source: "selection",
        layout: { "icon-image": "reticle", "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 12, 0.8, 17, 1.1], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-pitch-alignment": "viewport" },
      });

      // Interaction
      const clickable: { id: string; kind: Selection["kind"] }[] = [
        { id: "flights", kind: "flight" }, { id: "flights-mil", kind: "flight" }, { id: "transit", kind: "transit" }, { id: "transit-dot", kind: "transit" },
        { id: "cctv-ring", kind: "cctv" }, { id: "news", kind: "news" }, { id: "quakes-ring", kind: "quake" }, { id: "pop", kind: "pop" },
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

    const terminatorTimer = setInterval(() => {
      const src = map.getSource("terminator") as maplibregl.GeoJSONSource | undefined;
      src?.setData(nightPolygon());
    }, 60_000);

    return () => {
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
    setData(m, "transit", toFC(p.transit, (v) => [v.lon, v.lat], (v) => ({ type: v.type, __data: JSON.stringify(v) })));
    const rebuild = () => { if (m.getZoom() >= VEHICLE_3D_MINZOOM - 0.5) setData(m, "transit-3d", vehicleFootprints(p.transit, m.getZoom())); };
    rebuild();
    m.on("zoomend", rebuild);
    return () => { m.off("zoomend", rebuild); };
  }, [p.transit, loaded]);
  useEffect(() => {
    const m = ready(); if (!m) return;
    const pt = selectionPoint(p.selection, p.flights, p.transit);
    setData(m, "selection", pt ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: {} }] } : EMPTY);
  }, [p.selection, p.flights, p.transit, loaded]);
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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-xs tracking-[0.1em] text-[var(--color-text-dim)]" style={{ background: failed ? "var(--color-bg)" : "transparent" }} role="status">
          {failed ? "MAP UNAVAILABLE · needs WebGL and access to tiles.openfreemap.org" : "LOADING MAP…"}
        </div>
      )}
    </div>
  );
}

function setData(m: MLMap, id: string, fc: FeatureCollection) {
  (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
}

function applyVisibility(m: MLMap, layers: Record<LayerKey, boolean>) {
  for (const [key, ids] of Object.entries(LAYER_IDS) as [LayerKey, string[]][]) {
    for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", layers[key] ? "visible" : "none");
  }
}

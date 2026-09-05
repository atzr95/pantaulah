"use client";

import { memo, useMemo, useState, useCallback, useEffect, useRef, type RefObject } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import topoData from "@/lib/data/malaysia-states.json";
import type { MetricKey, CacheData } from "@/lib/data/types";
import {
  computeRankScale,
  getRampColor,
  getRampStroke,
  getRampGradient,
  type RankScale,
  getMetricValues,
  METRIC_CONFIGS,
  type ChoroplethConfig,
} from "@/lib/data/choropleth";
import { formatMetricValue } from "@/lib/utils/format";
import { AIRPORTS, PORTS, UNIVERSITIES } from "@/lib/data/poi";
import { useFlights, type Flight } from "@/lib/hooks/use-flights";
import { useTransit, type TransitVehicle } from "@/lib/hooks/use-transit";
import { HIGHWAYS as HIGHWAY_ROUTES } from "@/lib/data/highways";
import { RAIL_LINES } from "@/lib/data/rail-lines";
import { POI_COLORS, OVERLAY_COLORS } from "@/lib/ui/colors";
import { ContextLayer, LabelLayer, ReticleLayer } from "./map-decor";

function getPOIColor(type: string): string {
  if (type === "airport") return POI_COLORS.airport;
  if (type === "university") return POI_COLORS.university;
  return POI_COLORS.port;
}

interface MalaysiaMapProps {
  data: CacheData;
  selectedState: string | null;
  selectedMetric: MetricKey;
  selectedYear: number;
  selectedCategory: string;
  onStateSelect: (topoName: string | null) => void;
  onTransitZoomChange?: (zoomed: boolean) => void;
  sheetSnap?: "peek" | "half" | "full";
  mobileSlider?: React.ReactNode;
}

interface StateProperties {
  Name: string;
}

// Desktop: two side-by-side viewports (Peninsular | Borneo) sized from the container, 1 unit = 1px
const WEST_SHARE = 0.38;
// Keep the states clear of the HUD: metric toggles top-right, legend strip + time slider along the bottom
const D_INSET_WEST = { top: 28, right: 12, bottom: 175, left: 24 };
const D_INSET_EAST = { top: 72, right: 24, bottom: 175, left: 12 };
const D_LABEL_SIZE = 11;
const M_LABEL_SIZE = 13;

// Mobile SVG dimensions — each region gets full width
const M_W = 500;
const M_H_WEST = 420; // Peninsular — compact portrait
const M_H_EAST = 280; // Borneo — compact landscape
const M_PAD = 12;

const EAST_STATES = new Set(["Sabah", "Sarawak", "Labuan"]);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

/** Live content size of an element (ResizeObserver). Desktop map panels are drawn 1:1 in px. */
function useElementSize(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [size, setSize] = useState({ w: 960, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return size;
}

// Shared POI type
interface POI {
  name: string;
  lat: number;
  lon: number;
  type: string;
  size?: string;
  code?: string;
}

// Region filter helpers (lon-based)
const isWestPOI = (poi: POI) => poi.lon < 108;
const isEastPOI = (poi: POI) => poi.lon >= 108;

const ALL_POIS: POI[] = [...AIRPORTS, ...PORTS, ...UNIVERSITIES];
const POI_BY_KEY = new Map<string, POI>(ALL_POIS.map((p) => [`${p.type}-${p.name}`, p]));

type Projection = ReturnType<typeof geoMercator>;
type PathGen = ReturnType<typeof geoPath>;

// ── Choropleth state layer ──
interface StateLayerProps {
  features: Feature<Geometry, StateProperties>[];
  generator: PathGen;
  metricValues: Record<string, number | undefined>;
  scale: RankScale | null;
  config: ChoroplethConfig;
  selectedState: string | null;
  hoveredState: string | null;
  onStateSelect: (topoName: string | null) => void;
  onStateEnter: (name: string) => void;
  onStateLeave: () => void;
}

const StateLayer = memo(function StateLayer({
  features,
  generator,
  metricValues,
  scale,
  config,
  selectedState,
  hoveredState,
  onStateSelect,
  onStateEnter,
  onStateLeave,
}: StateLayerProps) {
  const paths = useMemo(
    () =>
      features.map((feat) => ({
        name: feat.properties.Name,
        d: generator(feat as GeoPermissibleObjects) || "",
      })),
    [features, generator]
  );

  return (
    <>
      {paths.map(({ name, d }) => {
        const value = metricValues[name];
        const t = value == null ? undefined : scale?.t[name];
        const isSelected = selectedState === name;
        const isHovered = hoveredState === name;

        return (
          <path
            key={name}
            d={d}
            fill={
              isSelected
                ? "rgba(0, 212, 255, 0.35)"
                : isHovered
                  ? "rgba(0, 212, 255, 0.3)"
                  : getRampColor(t, config.colorHue)
            }
            stroke={
              isSelected
                ? "#00d4ff"
                : isHovered
                  ? "rgba(0, 212, 255, 0.8)"
                  : getRampStroke(t, config.colorHue)
            }
            strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
            className="transition-all duration-300 cursor-pointer outline-none"
            style={{
              outline: "none",
              ...(isSelected
                ? { filter: "drop-shadow(0 0 8px rgba(0, 212, 255, 0.3))" }
                : {}),
            }}
            onClick={() => onStateSelect(isSelected ? null : name)}
            onMouseEnter={() => onStateEnter(name)}
            onMouseLeave={onStateLeave}
            onFocus={() => onStateEnter(name)}
            onBlur={onStateLeave}
            role="button"
            aria-label={`${name}: ${formatMetricValue(config.key, value)}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onStateSelect(isSelected ? null : name);
              }
            }}
          />
        );
      })}
    </>
  );
});

// ── POI markers ──
interface POILayerProps {
  pois: POI[];
  proj: Projection;
  hoveredPOI: string | null;
  onPOIEnter: (key: string) => void;
  onPOILeave: () => void;
}

const POILayer = memo(function POILayer({
  pois,
  proj,
  hoveredPOI,
  onPOIEnter,
  onPOILeave,
}: POILayerProps) {
  const projected = useMemo(() => {
    const pts = pois
      .map((poi) => ({ poi, coords: proj([poi.lon, poi.lat]) }))
      .filter((p) => p.coords != null);

    // Overlap nudging
    const offsets: Record<string, [number, number]> = {};
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = a.coords![0] - b.coords![0];
        const dy = a.coords![1] - b.coords![1];
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          const port = a.poi.type === "port" ? a : b;
          offsets[`${port.poi.type}-${port.poi.name}`] = [0, -8];
        }
      }
    }

    return pts.map(({ poi, coords }) => {
      const key = `${poi.type}-${poi.name}`;
      const [ox, oy] = offsets[key] || [0, 0];
      return { poi, key, cx: coords![0] + ox, cy: coords![1] + oy };
    });
  }, [pois, proj]);

  if (projected.length === 0) return null;

  return (
    <>
      {projected.map(({ poi, key, cx, cy }) => {
        const isLarge = poi.size === "large";
        const isHov = hoveredPOI === key;
        const r = isHov ? 7 : isLarge ? 5.5 : 4;
        const color = getPOIColor(poi.type);
        const symbol =
          poi.type === "airport" ? "✈" : poi.type === "university" ? "🎓" : "⚓";

        return (
          <g
            key={key}
            className="cursor-pointer"
            onMouseEnter={() => onPOIEnter(key)}
            onMouseLeave={onPOILeave}
            onClick={() => onPOIEnter(key)}
          >
            <circle cx={cx} cy={cy} r={r + 2} fill="transparent" />
            <circle
              cx={cx} cy={cy} r={r}
              fill={color} stroke="rgba(0, 0, 0, 0.6)" strokeWidth={0.8}
              opacity={isLarge ? 0.9 : 0.65}
              className="transition-all duration-150"
            />
            <text
              x={cx} y={cy} dy="0.35em" textAnchor="middle"
              fontSize={isHov ? 11 : isLarge ? 8 : 6}
              fill="rgba(0,0,0,0.85)"
              style={{ pointerEvents: "none" }}
              className="transition-all duration-150"
            >
              {symbol}
            </text>
          </g>
        );
      })}
    </>
  );
});

// ── Highway routes ──
const HighwayLayer = memo(function HighwayLayer({ proj }: { proj: Projection }) {
  const paths = useMemo(
    () =>
      HIGHWAY_ROUTES.map((route, i) => {
        const points = route.coords
          .map((c) => proj(c))
          .filter((p): p is [number, number] => p != null);
        if (points.length < 2) return null;
        return {
          key: `hw-${route.ref}-${i}`,
          d: "M" + points.map((p) => `${p[0]},${p[1]}`).join("L"),
        };
      }).filter((p): p is { key: string; d: string } => p != null),
    [proj]
  );

  return (
    <>
      {paths.map(({ key, d }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={OVERLAY_COLORS.highway}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
});

// ── Rail lines ──
const RailLayer = memo(function RailLayer({
  proj,
  transitZoom,
}: {
  proj: Projection;
  transitZoom: boolean;
}) {
  const paths = useMemo(
    () =>
      RAIL_LINES.map((line, i) => {
        const points = line.coords
          .map((c) => proj(c))
          .filter((p): p is [number, number] => p != null);
        if (points.length < 2) return null;
        return {
          key: `rail-${i}`,
          d: "M" + points.map((p) => `${p[0]},${p[1]}`).join("L"),
          color: line.color,
        };
      }).filter((p): p is { key: string; d: string; color: string } => p != null),
    [proj]
  );

  return (
    <>
      {paths.map(({ key, d, color }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={transitZoom ? (color || "#c084fc") : OVERLAY_COLORS.rail}
          strokeWidth={transitZoom ? 2.5 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={transitZoom ? 0.9 : 0.6}
          strokeDasharray={transitZoom ? "none" : "4 2"}
          style={{ pointerEvents: "none" }}
        />
      ))}
    </>
  );
});

// ── Live flight markers ──
// Airplane SVG path (pointing right, centered at origin)
const PLANE_PATH = "M-1.5,0 L-0.5,-0.8 L1.5,0 L-0.5,0.8 Z M-0.5,-0.4 L-1.8,-1.5 L-1.8,-1.2 L-0.5,-0.2 M-0.5,0.4 L-1.8,1.5 L-1.8,1.2 L-0.5,0.2";

interface FlightLayerProps {
  flights: Flight[];
  proj: Projection;
  hoveredFlightId: string | null;
  onFlightEnter: (f: Flight) => void;
  onFlightLeave: () => void;
}

const FlightLayer = memo(function FlightLayer({
  flights,
  proj,
  hoveredFlightId,
  onFlightEnter,
  onFlightLeave,
}: FlightLayerProps) {
  return (
    <>
      {flights.map((f, i) => {
        const coords = proj([f.lon, f.lat]);
        if (!coords) return null;
        const isHov = hoveredFlightId === f.icao24;
        const scale = isHov ? 5 : 3.5;
        return (
          <g
            key={`flight-${f.icao24 || i}`}
            onMouseEnter={() => onFlightEnter(f)}
            onMouseLeave={onFlightLeave}
            onClick={() => onFlightEnter(f)}
            className="cursor-pointer"
          >
            {/* Hit area */}
            <circle cx={coords[0]} cy={coords[1]} r={8} fill="transparent" />
            {/* Airplane icon rotated to heading */}
            <g transform={`translate(${coords[0]},${coords[1]}) scale(${scale}) rotate(${(f.heading || 0) - 90})`}>
              <path
                d={PLANE_PATH}
                fill={isHov ? POI_COLORS.flight : "rgba(255, 107, 107, 0.8)"}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={0.15}
              />
            </g>
          </g>
        );
      })}
    </>
  );
});

// ── Live transit markers (buses & trains) ──
interface TransitLayerProps {
  vehicles: TransitVehicle[];
  proj: Projection;
  hoveredTransitKey: string | null;
  onTransitEnter: (v: TransitVehicle) => void;
  onTransitLeave: () => void;
}

const TransitLayer = memo(function TransitLayer({
  vehicles,
  proj,
  hoveredTransitKey,
  onTransitEnter,
  onTransitLeave,
}: TransitLayerProps) {
  return (
    <>
      {vehicles.map((v, i) => {
        const coords = proj([v.lon, v.lat]);
        if (!coords) return null;
        const isHov = hoveredTransitKey === `${v.feed}::${v.id}`;
        const isTrain = v.type === "train";
        const color = isTrain
          ? (isHov ? POI_COLORS.train : "rgba(232, 121, 249, 0.9)")
          : (isHov ? POI_COLORS.bus : "rgba(251, 146, 60, 0.85)");
        const r = isTrain ? (isHov ? 5 : 3.5) : (isHov ? 4 : 2.5);
        return (
          <g
            key={`transit-${v.feed}-${v.id}-${i}`}
            onMouseEnter={() => onTransitEnter(v)}
            onMouseLeave={onTransitLeave}
            onClick={() => onTransitEnter(v)}
            className="cursor-pointer"
          >
            <circle cx={coords[0]} cy={coords[1]} r={6} fill="transparent" />
            {isTrain ? (
              <rect
                x={coords[0] - r} y={coords[1] - r}
                width={r * 2} height={r * 2}
                rx={0.5}
                fill={color}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.3}
              />
            ) : (
              <circle
                cx={coords[0]} cy={coords[1]}
                r={r}
                fill={color}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.3}
              />
            )}
          </g>
        );
      })}
    </>
  );
});

export default function MalaysiaMap({
  data,
  selectedState,
  selectedMetric,
  selectedYear,
  selectedCategory,
  onStateSelect,
  onTransitZoomChange,
  sheetSnap = "half",
  mobileSlider,
}: MalaysiaMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [hoveredPOI, setHoveredPOI] = useState<string | null>(null);
  const [hiddenPOITypes, setHiddenPOITypes] = useState<Set<string>>(new Set(["transit"]));
  const [legendOpen, setLegendOpen] = useState(false);
  const [hoveredFlight, setHoveredFlight] = useState<Flight | null>(null);
  const [hoveredTransit, setHoveredTransit] = useState<TransitVehicle | null>(null);
  const [transitZoomState, setTransitZoomState] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const flights = useFlights(selectedCategory === "transport" && !hiddenPOITypes.has("flight"));
  const transit = useTransit(selectedCategory === "transport" && !hiddenPOITypes.has("transit"));

  // Tooltip position lives outside React state — updated via rAF on mousemove
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);

  const handleRootMouseMove = useCallback((e: React.MouseEvent) => {
    tooltipPosRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = tooltipRef.current;
      if (el) {
        el.style.left = `${tooltipPosRef.current.x + 12}px`;
        el.style.top = `${tooltipPosRef.current.y - 10}px`;
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleStateEnter = useCallback((name: string) => setHoveredState(name), []);
  const handleStateLeave = useCallback(() => setHoveredState(null), []);
  const handlePOIEnter = useCallback((key: string) => {
    setHoveredPOI(key);
    setHoveredState(null);
  }, []);
  const handlePOILeave = useCallback(() => setHoveredPOI(null), []);
  const handleFlightEnter = useCallback((f: Flight) => {
    setHoveredFlight(f);
    setHoveredState(null);
    setHoveredPOI(null);
  }, []);
  const handleFlightLeave = useCallback(() => setHoveredFlight(null), []);
  const handleTransitEnter = useCallback((v: TransitVehicle) => {
    setHoveredTransit(v);
    setHoveredState(null);
    setHoveredPOI(null);
    setHoveredFlight(null);
  }, []);
  const handleTransitLeave = useCallback(() => setHoveredTransit(null), []);

  const togglePOIType = useCallback((type: string) => {
    setHiddenPOITypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (type === "transit" && next.has("transit")) setTransitZoomState(null);
      return next;
    });
  }, []);

  // Reset transit zoom when category changes or transit hidden
  useEffect(() => {
    const transitVisible = selectedCategory === "transport" && !hiddenPOITypes.has("transit");
    if (!transitVisible) setTransitZoomState(null);
  }, [selectedCategory, hiddenPOITypes]);

  // Notify parent of transit zoom state
  useEffect(() => {
    onTransitZoomChange?.(transitZoomState != null && selectedCategory === "transport" && !hiddenPOITypes.has("transit"));
  }, [transitZoomState, selectedCategory, hiddenPOITypes, onTransitZoomChange]);

  const topology = topoData as unknown as Topology;
  const geojson = useMemo(
    () =>
      feature(
        topology,
        topology.objects.states as GeometryCollection<StateProperties>
      ) as FeatureCollection<Geometry, StateProperties>,
    [topology]
  );

  // Split features by region
  const westFeatures = useMemo(
    () => geojson.features.filter((f) => !EAST_STATES.has(f.properties.Name)),
    [geojson]
  );
  const eastFeatures = useMemo(
    () => geojson.features.filter((f) => EAST_STATES.has(f.properties.Name)),
    [geojson]
  );

  // Two viewports (Peninsular / Borneo). Desktop cells are measured; mobile uses fixed boxes.
  const deskRef = useRef<HTMLDivElement>(null);
  const deskSize = useElementSize(deskRef, !isMobile);
  const westW = isMobile ? M_W : Math.max(300, Math.round(deskSize.w * WEST_SHARE));
  const eastW = isMobile ? M_W : Math.max(300, deskSize.w - westW - 1);
  const westH = isMobile ? M_H_WEST : deskSize.h;
  const eastH = isMobile ? M_H_EAST : deskSize.h;
  const westExtent = useMemo(
    (): [[number, number], [number, number]] =>
      isMobile
        ? [[M_PAD, M_PAD], [M_W - M_PAD, M_H_WEST - M_PAD]]
        : [[D_INSET_WEST.left, D_INSET_WEST.top], [westW - D_INSET_WEST.right, westH - D_INSET_WEST.bottom]],
    [isMobile, westW, westH]
  );
  const eastExtent = useMemo(
    (): [[number, number], [number, number]] =>
      isMobile
        ? [[M_PAD, M_PAD], [M_W - M_PAD, M_H_EAST - M_PAD]]
        : [[D_INSET_EAST.left, D_INSET_EAST.top], [eastW - D_INSET_EAST.right, eastH - D_INSET_EAST.bottom]],
    [isMobile, eastW, eastH]
  );

  const westGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({ type: "FeatureCollection", features: westFeatures }),
    [westFeatures]
  );
  const eastGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({ type: "FeatureCollection", features: eastFeatures }),
    [eastFeatures]
  );
  const westProjection = useMemo(() => geoMercator().fitExtent(westExtent, westGeo), [westExtent, westGeo]);
  const eastProjection = useMemo(() => geoMercator().fitExtent(eastExtent, eastGeo), [eastExtent, eastGeo]);

  // Transit zoom: when transit is visible + a state is picked from dropdown
  const transitZoom = selectedCategory === "transport" && !hiddenPOITypes.has("transit") && transitZoomState != null;

  const activeWestProjection = useMemo(() => {
    if (!transitZoom || !transitZoomState || EAST_STATES.has(transitZoomState)) return westProjection;
    const feat = westFeatures.find((f) => f.properties.Name === transitZoomState);
    return feat ? geoMercator().fitExtent(westExtent, feat) : westProjection;
  }, [transitZoom, transitZoomState, westProjection, westFeatures, westExtent]);
  const activeEastProjection = useMemo(() => {
    if (!transitZoom || !transitZoomState || !EAST_STATES.has(transitZoomState)) return eastProjection;
    const feat = eastFeatures.find((f) => f.properties.Name === transitZoomState);
    return feat ? geoMercator().fitExtent(eastExtent, feat) : eastProjection;
  }, [transitZoom, transitZoomState, eastProjection, eastFeatures, eastExtent]);

  const activeWestPathGen = useMemo(() => geoPath().projection(activeWestProjection), [activeWestProjection]);
  const activeEastPathGen = useMemo(() => geoPath().projection(activeEastProjection), [activeEastProjection]);

  // Choropleth
  const metricValues = useMemo(
    () => getMetricValues(data, selectedMetric, selectedYear),
    [data, selectedMetric, selectedYear]
  );
  const scale = useMemo(() => computeRankScale(metricValues), [metricValues]);
  const config = METRIC_CONFIGS.find((c) => c.key === selectedMetric)!;

  // Get relevant POIs for current category
  const categoryPois = useMemo(() => {
    if (selectedCategory === "education") {
      return UNIVERSITIES.filter((poi) => !hiddenPOITypes.has(poi.type));
    }
    if (selectedCategory === "economy") {
      return [...AIRPORTS, ...PORTS].filter((poi) => !hiddenPOITypes.has(poi.type));
    }
    return [];
  }, [selectedCategory, hiddenPOITypes]);

  const westPois = useMemo(() => categoryPois.filter(isWestPOI), [categoryPois]);
  const eastPois = useMemo(() => categoryPois.filter(isEastPOI), [categoryPois]);

  // Live markers: sort transit once (buses first, trains on top), filter by region
  const sortedTransit = useMemo(
    () => [...transit].sort((a, b) => (a.type === "train" ? 1 : 0) - (b.type === "train" ? 1 : 0)),
    [transit]
  );
  const westTransit = useMemo(() => sortedTransit.filter((v) => v.lon < 108), [sortedTransit]);
  const eastTransit = useMemo(() => sortedTransit.filter((v) => v.lon >= 108), [sortedTransit]);
  const westFlights = useMemo(() => flights.filter((f) => f.lon < 108), [flights]);
  const eastFlights = useMemo(() => flights.filter((f) => f.lon >= 108), [flights]);

  // Layer visibility
  const showHighways = selectedCategory === "transport" && !hiddenPOITypes.has("highway");
  const showRail = selectedCategory === "transport" && !hiddenPOITypes.has("rail");
  const showTransit = selectedCategory === "transport" && !hiddenPOITypes.has("transit") && transit.length > 0;
  const showFlights = selectedCategory === "transport" && !hiddenPOITypes.has("flight") && flights.length > 0;

  const hoveredFlightId = hoveredFlight?.icao24 ?? null;
  const hoveredTransitKey = hoveredTransit ? `${hoveredTransit.feed}::${hoveredTransit.id}` : null;

  // SVG click handler: deselect state and dismiss any tap-pinned tooltip
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const tag = (e.target as SVGElement).tagName;
      if (tag === "svg" || tag === "rect") {
        onStateSelect(null);
        setHoveredState(null);
        setHoveredPOI(null);
        setHoveredFlight(null);
        setHoveredTransit(null);
      }
    },
    [onStateSelect]
  );

  // Legend: desktop = one horizontal HUD strip above the slider; mobile (compact) = vertical popover list
  const renderLegendContent = (compact = false) => {
    const groupCls = compact ? "flex flex-col gap-1.5 pt-1.5 border-t border-[rgba(255,255,255,0.06)]" : "flex items-center gap-4";
    return (
    <>
      <div className={compact ? "space-y-0.5" : "flex items-baseline gap-2"}>
        <div className="tracking-[0.08em]" style={{ color: "rgba(0, 212, 255, 0.75)" }}>
          {config.label}
        </div>
        <div className="tracking-[0.06em] text-[var(--color-text-dim)]">AS OF {selectedYear}</div>
      </div>
      {scale && (
        <div className="flex items-center gap-2 tabular-nums">
          <span className="whitespace-nowrap">LOW {formatMetricValue(config.key, scale.min)}</span>
          <div
            className={`${compact ? "flex-1 min-w-12" : "w-24"} h-2 rounded-sm`}
            style={{ background: getRampGradient(config.colorHue), border: `1px solid ${getRampStroke(0.5, config.colorHue)}` }}
          />
          <span className="whitespace-nowrap">HIGH {formatMetricValue(config.key, scale.max)}</span>
        </div>
      )}
      <div className={groupCls}>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-2 rounded-sm"
            style={{
              background: getRampColor(undefined, config.colorHue),
              border: `1px solid ${getRampStroke(undefined, config.colorHue)}`,
            }}
          />
          NO DATA
        </div>
      </div>
      {selectedCategory === "economy" && (
        <div className={groupCls}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("airport")}>
            <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: POI_COLORS.airport, background: hiddenPOITypes.has("airport") ? "transparent" : POI_COLORS.airport }} />
            <span style={{ opacity: hiddenPOITypes.has("airport") ? 0.4 : 1 }}>AIRPORTS</span>
          </button>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("port")}>
            <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: POI_COLORS.port, background: hiddenPOITypes.has("port") ? "transparent" : POI_COLORS.port }} />
            <span style={{ opacity: hiddenPOITypes.has("port") ? 0.4 : 1 }}>PORTS</span>
          </button>
        </div>
      )}
      {selectedCategory === "education" && (
        <div className={groupCls}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("university")}>
            <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: POI_COLORS.university, background: hiddenPOITypes.has("university") ? "transparent" : POI_COLORS.university }} />
            <span style={{ opacity: hiddenPOITypes.has("university") ? 0.4 : 1 }}>UNIVERSITIES (IPTA)</span>
          </button>
        </div>
      )}
      {selectedCategory === "transport" && (
        <div className={groupCls}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("highway")}>
            <div className="w-4 h-0 border-t" style={{ borderColor: hiddenPOITypes.has("highway") ? "rgba(255,200,50,0.2)" : "rgba(255,200,50,0.5)", borderWidth: 1.5 }} />
            <span style={{ opacity: hiddenPOITypes.has("highway") ? 0.4 : 1 }}>HIGHWAYS</span>
          </button>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("rail")}>
            <div className="w-4 h-0" style={{ borderTop: hiddenPOITypes.has("rail") ? "1.5px dashed rgba(226,232,240,0.2)" : (transitZoom ? "2px solid #c084fc" : "1.5px dashed rgba(226,232,240,0.6)") }} />
            <span style={{ opacity: hiddenPOITypes.has("rail") ? 0.4 : 1 }}>RAIL LINES</span>
          </button>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("transit")}>
            <div className="w-2.5 h-2.5 rounded-sm border" style={{ borderColor: POI_COLORS.bus, background: hiddenPOITypes.has("transit") ? "transparent" : POI_COLORS.bus }} />
            <span style={{ opacity: hiddenPOITypes.has("transit") ? 0.4 : 1 }}>BUS &amp; KTM{transit.length > 0 ? ` (${transit.length})` : ""}</span>
          </button>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("flight")}>
            <svg width="10" height="8" viewBox="-4 -2 8 4">
              <polygon points="-3,0 3,-1.5 3,1.5" fill={hiddenPOITypes.has("flight") ? "transparent" : POI_COLORS.flight} stroke={POI_COLORS.flight} strokeWidth="0.5" />
            </svg>
            <span style={{ opacity: hiddenPOITypes.has("flight") ? 0.4 : 1 }}>LIVE FLIGHTS{flights.length > 0 ? ` (${flights.length})` : ""}</span>
          </button>
        </div>
      )}
    </>
    );
  };

  // Tooltip content (position handled imperatively via tooltipRef)
  const hoveredPoiData = hoveredPOI ? POI_BY_KEY.get(hoveredPOI) : null;
  const hasTooltip = !!(hoveredPoiData || hoveredFlight || hoveredTransit || hoveredState);

  const renderTooltipContent = () => {
    if (hoveredPoiData) {
      const poi = hoveredPoiData;
      const color = getPOIColor(poi.type);
      return (
        <div
          className="px-3 py-2 text-xs"
          style={{
            background: "rgba(13, 24, 30, 0.98)",
            border: `1px solid ${color}40`, borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-jetbrains)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold tracking-wider" style={{ color }}>
            {poi.type === "airport" ? "✈" : poi.type === "university" ? "🎓" : "⚓"} {poi.name}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5">
            {poi.type === "airport" ? "Airport" : poi.type === "university" ? "Public University" : "Port"}
            {poi.code ? ` · ${poi.code}` : ""}
            {poi.type !== "university" && (" · " + (poi.size === "large" ? "Major" : "Regional"))}
            {poi.type === "university" && (" · " + (poi.size === "large" ? "Research University" : "IPTA"))}
          </div>
        </div>
      );
    }

    if (hoveredFlight) {
      return (
        <div
          className="px-3 py-2 text-xs"
          style={{
            background: "rgba(13, 24, 30, 0.98)",
            border: "1px solid rgba(255, 107, 107, 0.3)", borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-jetbrains)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold tracking-wider" style={{ color: POI_COLORS.flight }}>
            ✈ {hoveredFlight.callsign || hoveredFlight.icao24}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5 space-y-0.5">
            {hoveredFlight.airline && (
              <div style={{ color: "var(--color-text-muted)" }}>
                {hoveredFlight.airline}{hoveredFlight.flightNum ? ` · Flight ${hoveredFlight.flightNum}` : ""}
              </div>
            )}
            {hoveredFlight.origin && <div>Country: {hoveredFlight.origin}</div>}
            <div>
              Alt: {(hoveredFlight.altitude * 3.281).toLocaleString("en-MY", { maximumFractionDigits: 0 })} ft ({hoveredFlight.altitude.toLocaleString()}m)
              {hoveredFlight.verticalRate !== 0 && (
                <span style={{ color: hoveredFlight.verticalRate > 0 ? "var(--color-green)" : "var(--color-amber)" }}>
                  {" "}{hoveredFlight.verticalRate > 0 ? "▲" : "▼"} {Math.abs(hoveredFlight.verticalRate)} m/min
                </span>
              )}
            </div>
            <div>Speed: {hoveredFlight.velocity} km/h · Hdg: {Math.round(hoveredFlight.heading || 0)}°</div>
            {hoveredFlight.squawk && <div>Squawk: {hoveredFlight.squawk}</div>}
          </div>
        </div>
      );
    }

    if (hoveredTransit) {
      return (
        <div
          className="px-3 py-2 text-xs"
          style={{
            background: "rgba(13, 24, 30, 0.98)",
            border: `1px solid ${hoveredTransit.type === "train" ? "rgba(232, 121, 249, 0.3)" : "rgba(251, 146, 60, 0.3)"}`, borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-jetbrains)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold tracking-wider" style={{ color: hoveredTransit.type === "train" ? POI_COLORS.train : POI_COLORS.bus }}>
            {hoveredTransit.type === "train" ? "🚆" : "🚌"} {hoveredTransit.label}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5 space-y-0.5">
            <div style={{ color: "var(--color-text-muted)" }}>{hoveredTransit.feed}</div>
            {hoveredTransit.routeId && <div>Route: {hoveredTransit.routeId}</div>}
            <div>Speed: {hoveredTransit.speed} km/h{hoveredTransit.bearing > 0 ? ` · Hdg: ${Math.round(hoveredTransit.bearing)}°` : ""}</div>
          </div>
        </div>
      );
    }

    if (hoveredState) {
      return (
        <div
          className="px-3 py-2 text-xs"
          style={{
            background: "rgba(13, 24, 30, 0.98)",
            border: "1px solid rgba(0, 212, 255, 0.3)", borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-jetbrains)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold text-[var(--color-cyan)] tracking-wider">
            {hoveredState.toUpperCase()}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5">
            {config.label}: {formatMetricValue(config.key, metricValues[hoveredState])}{" "}
            <span className="opacity-60">({selectedYear})</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const transitVisible = selectedCategory === "transport" && !hiddenPOITypes.has("transit");

  // State names for dropdown — sorted, with transit vehicle counts
  const stateNames = useMemo(() => {
    return geojson.features.map(f => f.properties.Name).sort();
  }, [geojson]);

  // One map viewport with every layer. Desktop panels get explicit px size; mobile scales to width.
  const renderPanel = (side: "west" | "east", w: number, h: number) => {
    const west = side === "west";
    const features = west ? westFeatures : eastFeatures;
    const proj = west ? activeWestProjection : activeEastProjection;
    const pathGen = west ? activeWestPathGen : activeEastPathGen;
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={isMobile ? undefined : w}
        height={isMobile ? undefined : h}
        className={isMobile ? "w-full h-auto" : "shrink-0"}
        style={{ background: "transparent", overflow: "hidden" }}
        onMouseLeave={handleStateLeave}
        onClick={handleSvgClick}
      >
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        <ContextLayer pathGen={pathGen} />
        {!isMobile && (
          <text
            x={w - 12}
            y={h - 12}
            textAnchor="end"
            fontSize={10}
            letterSpacing="0.14em"
            fill="rgba(128, 148, 159, 0.7)"
            style={{ fontFamily: "var(--font-jetbrains), monospace", pointerEvents: "none" }}
          >
            {west ? "PENINSULAR MALAYSIA" : "BORNEO"}
          </text>
        )}
        <StateLayer
          features={features}
          generator={pathGen}
          metricValues={metricValues}
          scale={scale}
          config={config}
          selectedState={selectedState}
          hoveredState={hoveredState}
          onStateSelect={onStateSelect}
          onStateEnter={handleStateEnter}
          onStateLeave={handleStateLeave}
        />
        <POILayer
          pois={west ? westPois : eastPois}
          proj={proj}
          hoveredPOI={hoveredPOI}
          onPOIEnter={handlePOIEnter}
          onPOILeave={handlePOILeave}
        />
        <LabelLayer
          features={features}
          pathGen={pathGen}
          selectedState={selectedState}
          hoveredState={hoveredState}
          fontSize={isMobile ? M_LABEL_SIZE : D_LABEL_SIZE}
        />
        {showHighways && <HighwayLayer proj={proj} />}
        {showRail && <RailLayer proj={proj} transitZoom={transitZoom} />}
        {showTransit && (
          <TransitLayer
            vehicles={west ? westTransit : eastTransit}
            proj={proj}
            hoveredTransitKey={hoveredTransitKey}
            onTransitEnter={handleTransitEnter}
            onTransitLeave={handleTransitLeave}
          />
        )}
        {showFlights && (
          <FlightLayer
            flights={west ? westFlights : eastFlights}
            proj={proj}
            hoveredFlightId={hoveredFlightId}
            onFlightEnter={handleFlightEnter}
            onFlightLeave={handleFlightLeave}
          />
        )}
        <ReticleLayer features={features} pathGen={pathGen} selectedState={selectedState} />
      </svg>
    );
  };

  return (
    <div
      className="relative flex-1 overflow-hidden min-h-0"
      onMouseMove={handleRootMouseMove}
      onClick={handleRootMouseMove}
    >
      {/* Selected-state watermark, behind the map panels */}
      {selectedState && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-14 lg:top-auto lg:bottom-[150px] text-center font-mono font-bold uppercase tracking-[0.2em] leading-none pointer-events-none select-none"
          style={{ fontSize: "clamp(40px, 8vw, 120px)", color: "transparent", WebkitTextStroke: "1px rgba(39, 215, 238, 0.12)" }}
        >
          {selectedState}
        </div>
      )}
      {/* Transit zoom dropdown — desktop: absolute top-left */}
      {!isMobile && transitVisible && (
        <div className="absolute top-2 left-2 z-10 hidden lg:block">
          <select
            value={transitZoomState || ""}
            onChange={(e) => setTransitZoomState(e.target.value || null)}
            className="px-2 py-1 text-xs tracking-wider rounded border border-[rgba(251,146,60,0.3)] bg-[rgba(13,24,30,0.96)] text-[var(--color-text-muted)] backdrop-blur-sm cursor-pointer outline-none hover:border-[rgba(251,146,60,0.5)] transition-colors"
            style={{ fontFamily: "var(--font-jetbrains)" }}
          >
            <option value="">ALL MALAYSIA</option>
            {stateNames.map((name) => (
              <option key={name} value={name}>{name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Desktop: Peninsular | Borneo viewports, drawn 1:1 in px ── */}
      {!isMobile && (
        <div ref={deskRef} className="relative hidden lg:flex w-full h-full">
          {renderPanel("west", westW, westH)}
          <div className="w-px h-full shrink-0" style={{ background: "var(--color-border)" }} />
          {renderPanel("east", eastW, eastH)}
        </div>
      )}

      {/* ── Mobile: stacked West / East SVGs ── */}
      {isMobile && (
        <div
          className="relative lg:hidden overflow-y-auto h-full"
          style={{
            paddingBottom: sheetSnap === "full" ? "92vh"
              : sheetSnap === "half" ? "52vh"
              : "140px",
          }}
        >
          <div className="px-1">
            <div className="text-xs tracking-[0.08em] text-[var(--color-text-dim)] px-2 pt-2">
              PENINSULAR MALAYSIA
            </div>
            {renderPanel("west", M_W, M_H_WEST)}
          </div>

          <div className="mx-4 border-t border-[rgba(0,212,255,0.08)]" />

          <div className="px-1">
            <div className="text-xs tracking-[0.08em] text-[var(--color-text-dim)] px-2 pt-2">
              EAST MALAYSIA
            </div>
            {renderPanel("east", M_W, M_H_EAST)}
          </div>

          {/* Mobile: inline time slider */}
          {mobileSlider && (
            <div className="px-3 py-2">
              {mobileSlider}
            </div>
          )}
        </div>
      )}

      {/* Tooltip — positioned imperatively, content driven by hover identity */}
      {hasTooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipPosRef.current.x + 12,
            top: tooltipPosRef.current.y - 10,
          }}
        >
          {renderTooltipContent()}
        </div>
      )}

      {/* Legend — desktop: one HUD strip above the time slider */}
      {!isMobile && (
        <div className="absolute bottom-[104px] left-5 right-[150px] hidden lg:flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-text-muted)] pointer-events-none [&>*]:pointer-events-auto">
          {renderLegendContent(false)}
        </div>
      )}

      {/* Legend — mobile: collapsible */}
      {isMobile && (
        <div className="absolute top-2 right-2 z-10 lg:hidden">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            aria-label="Toggle map legend and layer options"
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs tracking-wider rounded transition-all bg-[rgba(13,24,30,0.94)] backdrop-blur-sm border border-[var(--color-border-mid)] text-[var(--color-text-muted)]"
          >
            <div className="w-7 h-2 rounded-sm" style={{ background: getRampGradient(config.colorHue) }} />
            LEGEND
            <svg className={`w-2.5 h-2.5 opacity-50 transition-transform ${legendOpen ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {legendOpen && (
            <div
              className="mt-1 px-3 py-2 rounded border border-[var(--color-border-mid)] text-xs text-[var(--color-text-muted)] space-y-1.5"
              style={{ background: "rgba(13, 24, 30, 0.97)", backdropFilter: "blur(12px)" }}
            >
              {renderLegendContent(true)}
            </div>
          )}
          {transitVisible && (
            <select
              value={transitZoomState || ""}
              onChange={(e) => setTransitZoomState(e.target.value || null)}
              className="mt-1 w-full px-2 py-1 text-xs tracking-wider rounded border border-[rgba(251,146,60,0.3)] bg-[rgba(13,24,30,0.96)] text-[var(--color-text-muted)] cursor-pointer outline-none"
              style={{ fontFamily: "var(--font-jetbrains)" }}
            >
              <option value="">ALL MALAYSIA</option>
              {stateNames.map((name) => (
                <option key={name} value={name}>{name.toUpperCase()}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Coordinates — desktop only */}
      {!isMobile && (
        <div
          className="absolute bottom-4 left-4 text-xs tracking-wider hidden lg:block"
          style={{ color: "var(--color-text-muted)" }}
        >
          3.1390&deg;N 101.6869&deg;E
        </div>
      )}
    </div>
  );
}

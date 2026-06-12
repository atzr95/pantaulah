"use client";

import { memo, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import topoData from "@/lib/data/malaysia-states.json";
import type { MetricKey, CacheData } from "@/lib/data/types";
import {
  computeTerciles,
  getBucket,
  getBucketColor,
  getBucketStroke,
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

// Desktop SVG dimensions
const WIDTH = 960;
const HEIGHT = 500;

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
  terciles: ReturnType<typeof computeTerciles>;
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
  terciles,
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
        const bucket = getBucket(value, terciles);
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
                  : getBucketColor(bucket, config.colorHue)
            }
            stroke={
              isSelected
                ? "#00d4ff"
                : isHovered
                  ? "rgba(0, 212, 255, 0.8)"
                  : getBucketStroke(bucket, config.colorHue)
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

  // Desktop: single projection
  const PAD = 60;
  const projection = useMemo(() => {
    return geoMercator().fitExtent(
      [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
      geojson
    );
  }, [geojson]);

  // Mobile: separate projections per region
  const westGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({
      type: "FeatureCollection",
      features: westFeatures,
    }),
    [westFeatures]
  );
  const eastGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({
      type: "FeatureCollection",
      features: eastFeatures,
    }),
    [eastFeatures]
  );

  const westProjection = useMemo(() => {
    return geoMercator().fitExtent(
      [[M_PAD, M_PAD], [M_W - M_PAD, M_H_WEST - M_PAD]],
      westGeo
    );
  }, [westGeo]);
  const eastProjection = useMemo(() => {
    return geoMercator().fitExtent(
      [[M_PAD, M_PAD], [M_W - M_PAD, M_H_EAST - M_PAD]],
      eastGeo
    );
  }, [eastGeo]);

  // Transit zoom: when transit is visible + a state is picked from dropdown
  const transitZoom = selectedCategory === "transport" && !hiddenPOITypes.has("transit") && transitZoomState != null;

  const activeProjection = useMemo(() => {
    if (!transitZoom || !transitZoomState) return projection;
    const feat = geojson.features.find(f => f.properties.Name === transitZoomState);
    if (!feat) return projection;
    return geoMercator().fitExtent([[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]], feat);
  }, [transitZoom, transitZoomState, geojson, projection]);
  const activePathGen = useMemo(() => geoPath().projection(activeProjection), [activeProjection]);

  const activeWestProjection = useMemo(() => {
    if (!transitZoom || !transitZoomState || EAST_STATES.has(transitZoomState)) return westProjection;
    const feat = westFeatures.find(f => f.properties.Name === transitZoomState);
    if (!feat) return westProjection;
    return geoMercator().fitExtent([[M_PAD, M_PAD], [M_W - M_PAD, M_H_WEST - M_PAD]], feat);
  }, [transitZoom, transitZoomState, westProjection, westFeatures]);
  const activeEastProjection = useMemo(() => {
    if (!transitZoom || !transitZoomState || !EAST_STATES.has(transitZoomState)) return eastProjection;
    const feat = eastFeatures.find(f => f.properties.Name === transitZoomState);
    if (!feat) return eastProjection;
    return geoMercator().fitExtent([[M_PAD, M_PAD], [M_W - M_PAD, M_H_EAST - M_PAD]], feat);
  }, [transitZoom, transitZoomState, eastProjection, eastFeatures]);

  const activeWestPathGen = useMemo(() => geoPath().projection(activeWestProjection), [activeWestProjection]);
  const activeEastPathGen = useMemo(() => geoPath().projection(activeEastProjection), [activeEastProjection]);

  // Choropleth
  const metricValues = useMemo(
    () => getMetricValues(data, selectedMetric, selectedYear),
    [data, selectedMetric, selectedYear]
  );
  const terciles = useMemo(() => {
    const vals = Object.values(metricValues).filter((v): v is number => v != null);
    return computeTerciles(vals);
  }, [metricValues]);
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

  // Render legend content (shared between desktop and mobile)
  const renderLegendContent = (compact = false) => (
    <>
      <div
        className={`tracking-[2px] ${compact ? "mb-1.5" : "mb-2"}`}
        style={{ color: "rgba(0, 212, 255, 0.75)" }}
      >
        {config.label}
      </div>
      {terciles && (
        <>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{
                background: getBucketColor("high", config.colorHue),
                border: `1px solid ${getBucketStroke("high", config.colorHue)}`,
              }}
            />
            HIGH (&gt; {formatMetricValue(config.key, terciles.t2)})
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{
                background: getBucketColor("medium", config.colorHue),
                border: `1px solid ${getBucketStroke("medium", config.colorHue)}`,
              }}
            />
            MEDIUM
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{
                background: getBucketColor("low", config.colorHue),
                border: `1px solid ${getBucketStroke("low", config.colorHue)}`,
              }}
            />
            LOW (&lt; {formatMetricValue(config.key, terciles.t1)})
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{
                background: getBucketColor("none", config.colorHue),
                border: `1px solid ${getBucketStroke("none", config.colorHue)}`,
              }}
            />
            NO DATA
          </div>
        </>
      )}
      {selectedCategory === "economy" && (
        <div className={`${compact ? "mt-2 pt-1.5" : "mt-3 pt-2"} border-t border-[rgba(255,255,255,0.06)] space-y-1`}>
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
        <div className={`${compact ? "mt-2 pt-1.5" : "mt-3 pt-2"} border-t border-[rgba(255,255,255,0.06)] space-y-1`}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("university")}>
            <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: POI_COLORS.university, background: hiddenPOITypes.has("university") ? "transparent" : POI_COLORS.university }} />
            <span style={{ opacity: hiddenPOITypes.has("university") ? 0.4 : 1 }}>UNIVERSITIES (IPTA)</span>
          </button>
        </div>
      )}
      {selectedCategory === "transport" && (
        <div className="mt-3 pt-2 border-t border-[rgba(255,255,255,0.06)] space-y-1">
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
            background: "rgba(13, 13, 20, 0.95)",
            border: `1px solid ${color}40`, borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
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
            background: "rgba(13, 13, 20, 0.95)",
            border: "1px solid rgba(255, 107, 107, 0.3)", borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
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
            background: "rgba(13, 13, 20, 0.95)",
            border: `1px solid ${hoveredTransit.type === "train" ? "rgba(232, 121, 249, 0.3)" : "rgba(251, 146, 60, 0.3)"}`, borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
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
            background: "rgba(13, 13, 20, 0.95)",
            border: "1px solid rgba(0, 212, 255, 0.3)", borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold text-[var(--color-cyan)] tracking-wider">
            {hoveredState.toUpperCase()}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5">
            {config.label}: {formatMetricValue(config.key, metricValues[hoveredState])}
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

  return (
    <div
      className="relative flex-1 overflow-hidden min-h-0"
      onMouseMove={handleRootMouseMove}
      onClick={handleRootMouseMove}
    >
      {/* Transit zoom dropdown — desktop: absolute top-left */}
      {!isMobile && transitVisible && (
        <div className="absolute top-2 left-2 z-10 hidden lg:block">
          <select
            value={transitZoomState || ""}
            onChange={(e) => setTransitZoomState(e.target.value || null)}
            className="px-2 py-1 text-[10px] tracking-wider rounded border border-[rgba(251,146,60,0.3)] bg-[rgba(10,10,15,0.9)] text-[var(--color-text-muted)] backdrop-blur-sm cursor-pointer outline-none hover:border-[rgba(251,146,60,0.5)] transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <option value="">ALL MALAYSIA</option>
            {stateNames.map((name) => (
              <option key={name} value={name}>{name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Desktop: single combined SVG ── */}
      {!isMobile && (
        <div className="hidden lg:flex items-center w-full h-full">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-full"
            style={{ background: "transparent", overflow: "hidden" }}
            onMouseLeave={handleStateLeave}
            onClick={handleSvgClick}
          >
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />
            <StateLayer
              features={geojson.features}
              generator={activePathGen}
              metricValues={metricValues}
              terciles={terciles}
              config={config}
              selectedState={selectedState}
              hoveredState={hoveredState}
              onStateSelect={onStateSelect}
              onStateEnter={handleStateEnter}
              onStateLeave={handleStateLeave}
            />
            <POILayer
              pois={categoryPois}
              proj={activeProjection}
              hoveredPOI={hoveredPOI}
              onPOIEnter={handlePOIEnter}
              onPOILeave={handlePOILeave}
            />
            {showHighways && <HighwayLayer proj={activeProjection} />}
            {showRail && <RailLayer proj={activeProjection} transitZoom={transitZoom} />}
            {showTransit && (
              <TransitLayer
                vehicles={sortedTransit}
                proj={activeProjection}
                hoveredTransitKey={hoveredTransitKey}
                onTransitEnter={handleTransitEnter}
                onTransitLeave={handleTransitLeave}
              />
            )}
            {showFlights && (
              <FlightLayer
                flights={flights}
                proj={activeProjection}
                hoveredFlightId={hoveredFlightId}
                onFlightEnter={handleFlightEnter}
                onFlightLeave={handleFlightLeave}
              />
            )}
          </svg>
        </div>
      )}

      {/* ── Mobile: stacked West / East SVGs ── */}
      {isMobile && (
        <div
          className="lg:hidden overflow-y-auto h-full"
          style={{
            paddingBottom: sheetSnap === "full" ? "92vh"
              : sheetSnap === "half" ? "52vh"
              : "180px",
          }}
        >
          {/* West Malaysia */}
          <div className="px-1">
            <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] px-2 pt-2">
              PENINSULAR MALAYSIA
            </div>
            <svg
              viewBox={`0 0 ${M_W} ${M_H_WEST}`}
              className="w-full h-auto"
              style={{ background: "transparent", overflow: "hidden" }}
              onMouseLeave={handleStateLeave}
              onClick={handleSvgClick}
            >
              <rect x="0" y="0" width={M_W} height={M_H_WEST} fill="transparent" />
              <StateLayer
                features={westFeatures}
                generator={activeWestPathGen}
                metricValues={metricValues}
                terciles={terciles}
                config={config}
                selectedState={selectedState}
                hoveredState={hoveredState}
                onStateSelect={onStateSelect}
                onStateEnter={handleStateEnter}
                onStateLeave={handleStateLeave}
              />
              <POILayer
                pois={westPois}
                proj={activeWestProjection}
                hoveredPOI={hoveredPOI}
                onPOIEnter={handlePOIEnter}
                onPOILeave={handlePOILeave}
              />
              {showHighways && <HighwayLayer proj={activeWestProjection} />}
              {showRail && <RailLayer proj={activeWestProjection} transitZoom={transitZoom} />}
              {showTransit && (
                <TransitLayer
                  vehicles={westTransit}
                  proj={activeWestProjection}
                  hoveredTransitKey={hoveredTransitKey}
                  onTransitEnter={handleTransitEnter}
                  onTransitLeave={handleTransitLeave}
                />
              )}
              {showFlights && (
                <FlightLayer
                  flights={westFlights}
                  proj={activeWestProjection}
                  hoveredFlightId={hoveredFlightId}
                  onFlightEnter={handleFlightEnter}
                  onFlightLeave={handleFlightLeave}
                />
              )}
            </svg>
          </div>

          {/* Divider */}
          <div
            className="mx-4 border-t border-[rgba(0,212,255,0.08)]"
          />

          {/* East Malaysia */}
          <div className="px-1">
            <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] px-2 pt-2">
              EAST MALAYSIA
            </div>
            <svg
              viewBox={`0 0 ${M_W} ${M_H_EAST}`}
              className="w-full h-auto"
              style={{ background: "transparent", overflow: "hidden" }}
              onMouseLeave={handleStateLeave}
              onClick={handleSvgClick}
            >
              <rect x="0" y="0" width={M_W} height={M_H_EAST} fill="transparent" />
              <StateLayer
                features={eastFeatures}
                generator={activeEastPathGen}
                metricValues={metricValues}
                terciles={terciles}
                config={config}
                selectedState={selectedState}
                hoveredState={hoveredState}
                onStateSelect={onStateSelect}
                onStateEnter={handleStateEnter}
                onStateLeave={handleStateLeave}
              />
              <POILayer
                pois={eastPois}
                proj={activeEastProjection}
                hoveredPOI={hoveredPOI}
                onPOIEnter={handlePOIEnter}
                onPOILeave={handlePOILeave}
              />
              {showHighways && <HighwayLayer proj={activeEastProjection} />}
              {showRail && <RailLayer proj={activeEastProjection} transitZoom={transitZoom} />}
              {showTransit && (
                <TransitLayer
                  vehicles={eastTransit}
                  proj={activeEastProjection}
                  hoveredTransitKey={hoveredTransitKey}
                  onTransitEnter={handleTransitEnter}
                  onTransitLeave={handleTransitLeave}
                />
              )}
              {showFlights && (
                <FlightLayer
                  flights={eastFlights}
                  proj={activeEastProjection}
                  hoveredFlightId={hoveredFlightId}
                  onFlightEnter={handleFlightEnter}
                  onFlightLeave={handleFlightLeave}
                />
              )}
            </svg>
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

      {/* Legend — desktop: full, bottom-left, above slider area */}
      {!isMobile && (
        <div className="absolute bottom-36 left-5 text-[10px] text-[var(--color-text-muted)] space-y-1.5 hidden lg:block">
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
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-[10px] tracking-wider rounded transition-all bg-[rgba(10,10,15,0.85)] backdrop-blur-sm border border-[var(--color-border-mid)] text-[var(--color-text-muted)]"
          >
            <div className="flex gap-0.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: getBucketColor("high", config.colorHue) }} />
              <div className="w-2 h-2 rounded-sm" style={{ background: getBucketColor("medium", config.colorHue) }} />
              <div className="w-2 h-2 rounded-sm" style={{ background: getBucketColor("low", config.colorHue) }} />
            </div>
            LEGEND
            <svg className={`w-2.5 h-2.5 opacity-50 transition-transform ${legendOpen ? "rotate-180" : ""}`} viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {legendOpen && (
            <div
              className="mt-1 px-3 py-2 rounded border border-[rgba(0,212,255,0.2)] text-[10px] text-[var(--color-text-muted)] space-y-1.5"
              style={{ background: "rgba(10, 10, 15, 0.92)", backdropFilter: "blur(12px)" }}
            >
              {renderLegendContent(true)}
            </div>
          )}
          {transitVisible && (
            <select
              value={transitZoomState || ""}
              onChange={(e) => setTransitZoomState(e.target.value || null)}
              className="mt-1 w-full px-2 py-1 text-[10px] tracking-wider rounded border border-[rgba(251,146,60,0.3)] bg-[rgba(10,10,15,0.9)] text-[var(--color-text-muted)] cursor-pointer outline-none"
              style={{ fontFamily: "var(--font-mono)" }}
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

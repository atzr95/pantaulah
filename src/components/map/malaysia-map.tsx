"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
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
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hiddenPOITypes, setHiddenPOITypes] = useState<Set<string>>(new Set(["transit"]));
  const [legendOpen, setLegendOpen] = useState(false);
  const [hoveredFlight, setHoveredFlight] = useState<Flight | null>(null);
  const [hoveredTransit, setHoveredTransit] = useState<TransitVehicle | null>(null);
  const [transitZoomState, setTransitZoomState] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const flights = useFlights(selectedCategory === "transport");
  const transit = useTransit(selectedCategory === "transport");

  const togglePOIType = useCallback((type: string) => {
    setHiddenPOITypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (type === "transit" && !next.has("transit") === false) setTransitZoomState(null);
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
  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

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

  const westPathGen = useMemo(() => geoPath().projection(westProjection), [westProjection]);
  const eastPathGen = useMemo(() => geoPath().projection(eastProjection), [eastProjection]);

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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, name: string) => {
      setHoveredState(name);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    },
    []
  );

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

  // Render state paths for a set of features
  const renderStates = (
    features: Feature<Geometry, StateProperties>[],
    generator: ReturnType<typeof geoPath>,
  ) =>
    features.map((feat) => {
      const name = feat.properties.Name;
      const value = metricValues[name];
      const bucket = getBucket(value, terciles);
      const isSelected = selectedState === name;
      const isHovered = hoveredState === name;

      return (
        <path
          key={name}
          d={generator(feat as GeoPermissibleObjects) || ""}
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
          onMouseMove={(e) => handleMouseMove(e, name)}
          onMouseLeave={() => setHoveredState(null)}
          role="button"
          aria-label={`${name}: ${formatMetricValue(config.key, value)}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onStateSelect(isSelected ? null : name);
          }}
        />
      );
    });

  // Render POI markers for a given projection and region filter
  const renderPOIs = (
    proj: ReturnType<typeof geoMercator>,
    regionFilter: (poi: POI) => boolean,
  ) => {
    if (categoryPois.length === 0) return null;

    const filtered = categoryPois.filter(regionFilter);
    const projected = filtered
      .map((poi) => ({ poi, coords: proj([poi.lon, poi.lat]) }))
      .filter((p) => p.coords != null);

    // Overlap nudging
    const offsets: Record<string, [number, number]> = {};
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const a = projected[i], b = projected[j];
        const dx = a.coords![0] - b.coords![0];
        const dy = a.coords![1] - b.coords![1];
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          const port = a.poi.type === "port" ? a : b;
          offsets[`${port.poi.type}-${port.poi.name}`] = [0, -8];
        }
      }
    }

    return projected.map(({ poi, coords: c }) => {
      const poiKey = `${poi.type}-${poi.name}`;
      const [ox, oy] = offsets[poiKey] || [0, 0];
      const cx = c![0] + ox;
      const cy = c![1] + oy;
      const isLarge = poi.size === "large";
      const isHov = hoveredPOI === poiKey;
      const r = isHov ? 7 : isLarge ? 5.5 : 4;
      const color =
        poi.type === "airport" ? "#ff9f43" : poi.type === "university" ? "#ffd43b" : "#2ed573";
      const symbol =
        poi.type === "airport" ? "✈" : poi.type === "university" ? "🎓" : "⚓";

      return (
        <g
          key={poiKey}
          className="cursor-pointer"
          onMouseMove={(e) => {
            setHoveredPOI(poiKey);
            setHoveredState(null);
            setTooltipPos({ x: e.clientX, y: e.clientY });
          }}
          onMouseLeave={() => setHoveredPOI(null)}
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
    });
  };

  // SVG click handler to deselect
  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const tag = (e.target as SVGElement).tagName;
      if (tag === "svg" || tag === "rect") onStateSelect(null);
    },
    [onStateSelect]
  );

  // Render highway routes
  const renderHighways = (proj: ReturnType<typeof geoMercator>) => {
    if (selectedCategory !== "transport" || hiddenPOITypes.has("highway")) return null;
    return HIGHWAY_ROUTES.map((route, i) => {
      const points = route.coords
        .map((c) => proj(c))
        .filter((p): p is [number, number] => p != null);
      if (points.length < 2) return null;
      const d = "M" + points.map((p) => `${p[0]},${p[1]}`).join("L");
      return (
        <path
          key={`hw-${route.ref}-${i}`}
          d={d}
          fill="none"
          stroke="rgba(255, 200, 50, 0.35)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      );
    });
  };

  // Render rail lines
  const renderRailLines = (proj: ReturnType<typeof geoMercator>) => {
    if (selectedCategory !== "transport" || hiddenPOITypes.has("rail")) return null;
    return RAIL_LINES.map((line, i) => {
      const points = line.coords
        .map((c) => proj(c))
        .filter((p): p is [number, number] => p != null);
      if (points.length < 2) return null;
      const d = "M" + points.map((p) => `${p[0]},${p[1]}`).join("L");
      // Zoomed out: bright white so it pops against highways
      // Zoomed in: individual line colors
      const stroke = transitZoom ? (line.color || "#c084fc") : "#e2e8f0";
      return (
        <path
          key={`rail-${i}`}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={transitZoom ? 2.5 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={transitZoom ? 0.9 : 0.6}
          strokeDasharray={transitZoom ? "none" : "4 2"}
          style={{ pointerEvents: "none" }}
        />
      );
    });
  };

  // Render live flight markers
  const renderFlights = (proj: ReturnType<typeof geoMercator>) => {
    if (selectedCategory !== "transport" || flights.length === 0 || hiddenPOITypes.has("flight")) return null;
    // Airplane SVG path (pointing right, centered at origin)
    const planePath = "M-1.5,0 L-0.5,-0.8 L1.5,0 L-0.5,0.8 Z M-0.5,-0.4 L-1.8,-1.5 L-1.8,-1.2 L-0.5,-0.2 M-0.5,0.4 L-1.8,1.5 L-1.8,1.2 L-0.5,0.2";
    return flights.map((f, i) => {
      const coords = proj([f.lon, f.lat]);
      if (!coords) return null;
      const isHov = hoveredFlight?.icao24 === f.icao24;
      const scale = isHov ? 5 : 3.5;
      return (
        <g
          key={`flight-${f.icao24 || i}`}
          onMouseMove={(e) => {
            setHoveredFlight(f);
            setHoveredState(null);
            setHoveredPOI(null);
            setTooltipPos({ x: e.clientX, y: e.clientY });
          }}
          onMouseLeave={() => setHoveredFlight(null)}
          className="cursor-pointer"
        >
          {/* Hit area */}
          <circle cx={coords[0]} cy={coords[1]} r={8} fill="transparent" />
          {/* Airplane icon rotated to heading */}
          <g transform={`translate(${coords[0]},${coords[1]}) scale(${scale}) rotate(${(f.heading || 0) - 90})`}>
            <path
              d={planePath}
              fill={isHov ? "#ff6b6b" : "rgba(255, 107, 107, 0.8)"}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={0.15}
            />
          </g>
        </g>
      );
    });
  };

  // Render live transit markers (buses & trains)
  const renderTransit = (proj: ReturnType<typeof geoMercator>) => {
    if (selectedCategory !== "transport" || transit.length === 0 || hiddenPOITypes.has("transit")) return null;
    // Render buses first, trains on top
    const sorted = [...transit].sort((a, b) => (a.type === "train" ? 1 : 0) - (b.type === "train" ? 1 : 0));
    return sorted.map((v, i) => {
      const coords = proj([v.lon, v.lat]);
      if (!coords) return null;
      const isHov = hoveredTransit?.id === v.id && hoveredTransit?.feed === v.feed;
      const isTrain = v.type === "train";
      const color = isTrain
        ? (isHov ? "#e879f9" : "rgba(232, 121, 249, 0.9)")
        : (isHov ? "#fb923c" : "rgba(251, 146, 60, 0.85)");
      const r = isTrain ? (isHov ? 5 : 3.5) : (isHov ? 4 : 2.5);
      return (
        <g
          key={`transit-${v.feed}-${v.id}-${i}`}
          onMouseMove={(e) => {
            setHoveredTransit(v);
            setHoveredState(null);
            setHoveredPOI(null);
            setHoveredFlight(null);
            setTooltipPos({ x: e.clientX, y: e.clientY });
          }}
          onMouseLeave={() => setHoveredTransit(null)}
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
    });
  };

  // Region filter helpers for POIs (lon-based)
  const isWestPOI = (poi: POI) => poi.lon < 108;
  const isEastPOI = (poi: POI) => poi.lon >= 108;

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
                background: config.colorHue === "amber" ? "rgba(255, 149, 0, 0.3)" : "rgba(0, 212, 255, 0.3)",
              }}
            />
            HIGH (&gt; {formatMetricValue(config.key, terciles.t2)})
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{
                background: config.colorHue === "amber" ? "rgba(255, 149, 0, 0.15)" : "rgba(0, 212, 255, 0.15)",
              }}
            />
            MEDIUM
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`${compact ? "w-3 h-2" : "w-4 h-2.5"} rounded-sm`}
              style={{ background: "rgba(0, 212, 255, 0.06)" }}
            />
            LOW (&lt; {formatMetricValue(config.key, terciles.t1)})
          </div>
        </>
      )}
      {selectedCategory === "economy" && (
        <div className={`${compact ? "mt-2 pt-1.5" : "mt-3 pt-2"} border-t border-[rgba(255,255,255,0.06)] space-y-1`}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("airport")}>
            <div className="w-2.5 h-2.5 rounded-full border border-[#ff9f43]" style={{ background: hiddenPOITypes.has("airport") ? "transparent" : "#ff9f43" }} />
            <span style={{ opacity: hiddenPOITypes.has("airport") ? 0.4 : 1 }}>AIRPORTS</span>
          </button>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("port")}>
            <div className="w-2.5 h-2.5 rounded-full border border-[#2ed573]" style={{ background: hiddenPOITypes.has("port") ? "transparent" : "#2ed573" }} />
            <span style={{ opacity: hiddenPOITypes.has("port") ? 0.4 : 1 }}>PORTS</span>
          </button>
        </div>
      )}
      {selectedCategory === "education" && (
        <div className={`${compact ? "mt-2 pt-1.5" : "mt-3 pt-2"} border-t border-[rgba(255,255,255,0.06)] space-y-1`}>
          <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("university")}>
            <div className="w-2.5 h-2.5 rounded-full border border-[#ffd43b]" style={{ background: hiddenPOITypes.has("university") ? "transparent" : "#ffd43b" }} />
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
          {transit.length > 0 && (
            <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("transit")}>
              <div className="w-2.5 h-2.5 rounded-sm border border-[#fb923c]" style={{ background: hiddenPOITypes.has("transit") ? "transparent" : "#fb923c" }} />
              <span style={{ opacity: hiddenPOITypes.has("transit") ? 0.4 : 1 }}>BUS &amp; KTM ({transit.length})</span>
            </button>
          )}
          {flights.length > 0 && (
            <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => togglePOIType("flight")}>
              <svg width="10" height="8" viewBox="-4 -2 8 4">
                <polygon points="-3,0 3,-1.5 3,1.5" fill={hiddenPOITypes.has("flight") ? "transparent" : "#ff6b6b"} stroke="#ff6b6b" strokeWidth="0.5" />
              </svg>
              <span style={{ opacity: hiddenPOITypes.has("flight") ? 0.4 : 1 }}>LIVE FLIGHTS ({flights.length})</span>
            </button>
          )}
        </div>
      )}
    </>
  );

  // Tooltip rendering (shared)
  const renderTooltips = () => (
    <>
      {hoveredPOI && (() => {
        const allPois = [...AIRPORTS, ...PORTS, ...UNIVERSITIES];
        const poi = allPois.find((p) => `${p.type}-${p.name}` === hoveredPOI);
        if (!poi) return null;
        const color = poi.type === "airport" ? "#ff9f43" : poi.type === "university" ? "#ffd43b" : "#2ed573";
        return (
          <div
            className="fixed z-50 pointer-events-none px-3 py-2 text-xs"
            style={{
              left: tooltipPos.x + 12, top: tooltipPos.y - 10,
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
      })()}

      {hoveredFlight && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 text-xs"
          style={{
            left: tooltipPos.x + 12, top: tooltipPos.y - 10,
            background: "rgba(13, 13, 20, 0.95)",
            border: "1px solid rgba(255, 107, 107, 0.3)", borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold tracking-wider" style={{ color: "#ff6b6b" }}>
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
      )}

      {hoveredTransit && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 text-xs"
          style={{
            left: tooltipPos.x + 12, top: tooltipPos.y - 10,
            background: "rgba(13, 13, 20, 0.95)",
            border: `1px solid ${hoveredTransit.type === "train" ? "rgba(232, 121, 249, 0.3)" : "rgba(251, 146, 60, 0.3)"}`, borderRadius: 4,
            color: "#e2e8f0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
          }}
        >
          <div className="font-bold tracking-wider" style={{ color: hoveredTransit.type === "train" ? "#e879f9" : "#fb923c" }}>
            {hoveredTransit.type === "train" ? "🚆" : "🚌"} {hoveredTransit.label}
          </div>
          <div className="text-[var(--color-text-dim)] mt-0.5 space-y-0.5">
            <div style={{ color: "var(--color-text-muted)" }}>{hoveredTransit.feed}</div>
            {hoveredTransit.routeId && <div>Route: {hoveredTransit.routeId}</div>}
            <div>Speed: {hoveredTransit.speed} km/h{hoveredTransit.bearing > 0 ? ` · Hdg: ${Math.round(hoveredTransit.bearing)}°` : ""}</div>
          </div>
        </div>
      )}

      {hoveredState && !hoveredPOI && !hoveredFlight && !hoveredTransit && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 text-xs"
          style={{
            left: tooltipPos.x + 12, top: tooltipPos.y - 10,
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
      )}
    </>
  );

  const transitVisible = selectedCategory === "transport" && !hiddenPOITypes.has("transit");

  // State names for dropdown — sorted, with transit vehicle counts
  const stateNames = useMemo(() => {
    return geojson.features.map(f => f.properties.Name).sort();
  }, [geojson]);

  return (
    <div className="relative flex-1 overflow-hidden min-h-0">
      {/* Transit zoom dropdown — desktop: absolute top-left */}
      {transitVisible && (
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
      <div className="hidden lg:flex items-center w-full h-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-full"
          style={{ background: "transparent", overflow: "hidden" }}
          onMouseLeave={() => setHoveredState(null)}
          onClick={handleSvgClick}
        >
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />
          {renderStates(geojson.features, activePathGen)}
          {renderPOIs(activeProjection, () => true)}
          {renderHighways(activeProjection)}
          {renderRailLines(activeProjection)}
          {renderTransit(activeProjection)}
          {renderFlights(activeProjection)}
        </svg>
      </div>

      {/* ── Mobile: stacked West / East SVGs ── */}
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
            onMouseLeave={() => setHoveredState(null)}
            onClick={handleSvgClick}
          >
            <rect x="0" y="0" width={M_W} height={M_H_WEST} fill="transparent" />
            {renderStates(westFeatures, activeWestPathGen)}
            {renderPOIs(activeWestProjection, isWestPOI)}
            {renderHighways(activeWestProjection)}
            {renderRailLines(activeWestProjection)}
            {renderTransit(activeWestProjection)}
            {renderFlights(activeWestProjection)}
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
            onMouseLeave={() => setHoveredState(null)}
            onClick={handleSvgClick}
          >
            <rect x="0" y="0" width={M_W} height={M_H_EAST} fill="transparent" />
            {renderStates(eastFeatures, activeEastPathGen)}
            {renderPOIs(activeEastProjection, isEastPOI)}
            {renderHighways(activeEastProjection)}
            {renderRailLines(activeEastProjection)}
            {renderTransit(activeEastProjection)}
            {renderFlights(activeEastProjection)}
          </svg>
        </div>

        {/* Mobile: inline time slider */}
        {mobileSlider && (
          <div className="px-3 py-2">
            {mobileSlider}
          </div>
        )}
      </div>

      {/* Tooltips */}
      {renderTooltips()}

      {/* Legend — desktop: full, bottom-left, above slider area */}
      <div className="absolute bottom-36 left-5 text-[10px] text-[var(--color-text-muted)] space-y-1.5 hidden lg:block">
        {renderLegendContent(false)}
      </div>

      {/* Legend — mobile: collapsible */}
      <div className="absolute top-2 right-2 z-10 lg:hidden">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider rounded transition-all bg-[rgba(10,10,15,0.85)] backdrop-blur-sm border border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)]"
        >
          <div className="flex gap-0.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: config.colorHue === "amber" ? "rgba(255, 149, 0, 0.3)" : "rgba(0, 212, 255, 0.3)" }} />
            <div className="w-2 h-2 rounded-sm" style={{ background: config.colorHue === "amber" ? "rgba(255, 149, 0, 0.15)" : "rgba(0, 212, 255, 0.15)" }} />
            <div className="w-2 h-2 rounded-sm" style={{ background: "rgba(0, 212, 255, 0.06)" }} />
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

      {/* Coordinates — desktop only */}
      <div
        className="absolute bottom-4 left-4 text-xs tracking-wider hidden lg:block"
        style={{ color: "var(--color-text-muted)" }}
      >
        3.1390&deg;N 101.6869&deg;E
      </div>
    </div>
  );
}

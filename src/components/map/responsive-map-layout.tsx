"use client";

import { useMemo, useEffect, useState, type ReactNode } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import topoData from "@/lib/data/malaysia-states.json";

interface StateProperties {
  Name: string;
}

const WIDTH = 960;
const HEIGHT = 500;
const M_W = 500;
const M_H_WEST = 420;
const M_H_EAST = 280;
const M_PAD = 12;
const PAD = 60;

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

export interface MapProjections {
  // Desktop: single projection
  projection: ReturnType<typeof geoMercator>;
  pathGen: ReturnType<typeof geoPath>;
  // Mobile: per-region
  westProjection: ReturnType<typeof geoMercator>;
  westPathGen: ReturnType<typeof geoPath>;
  eastProjection: ReturnType<typeof geoMercator>;
  eastPathGen: ReturnType<typeof geoPath>;
  // Feature sets
  allFeatures: Feature<Geometry, StateProperties>[];
  westFeatures: Feature<Geometry, StateProperties>[];
  eastFeatures: Feature<Geometry, StateProperties>[];
  isMobile: boolean;
}

/** Hook that provides all projections and feature splits */
export function useMapProjections(): MapProjections {
  const isMobile = useIsMobile();

  const topology = topoData as unknown as Topology;
  const geojson = useMemo(
    () =>
      feature(
        topology,
        topology.objects.states as GeometryCollection<StateProperties>
      ) as FeatureCollection<Geometry, StateProperties>,
    [topology]
  );

  const westFeatures = useMemo(
    () => geojson.features.filter((f) => !EAST_STATES.has(f.properties.Name)),
    [geojson]
  );
  const eastFeatures = useMemo(
    () => geojson.features.filter((f) => EAST_STATES.has(f.properties.Name)),
    [geojson]
  );

  const projection = useMemo(
    () => geoMercator().fitExtent([[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]], geojson),
    [geojson]
  );
  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

  const westGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({ type: "FeatureCollection", features: westFeatures }),
    [westFeatures]
  );
  const eastGeo = useMemo(
    (): FeatureCollection<Geometry, StateProperties> => ({ type: "FeatureCollection", features: eastFeatures }),
    [eastFeatures]
  );

  const westProjection = useMemo(
    () => geoMercator().fitExtent([[M_PAD, M_PAD], [M_W - M_PAD, M_H_WEST - M_PAD]], westGeo),
    [westGeo]
  );
  const eastProjection = useMemo(
    () => geoMercator().fitExtent([[M_PAD, M_PAD], [M_W - M_PAD, M_H_EAST - M_PAD]], eastGeo),
    [eastGeo]
  );

  const westPathGen = useMemo(() => geoPath().projection(westProjection), [westProjection]);
  const eastPathGen = useMemo(() => geoPath().projection(eastProjection), [eastProjection]);

  return {
    projection, pathGen,
    westProjection, westPathGen,
    eastProjection, eastPathGen,
    allFeatures: geojson.features,
    westFeatures, eastFeatures,
    isMobile,
  };
}

interface ResponsiveMapLayoutProps {
  /** Render SVG children given features and a path generator */
  renderSVGContent: (
    features: Feature<Geometry, StateProperties>[],
    pathGen: ReturnType<typeof geoPath>,
    projection: ReturnType<typeof geoMercator>,
  ) => ReactNode;
  /** Optional overlay content (tooltips, legends) rendered outside SVGs */
  overlay?: ReactNode;
  /** Click handler for empty SVG area */
  onBackgroundClick?: () => void;
  onMouseLeave?: () => void;
  projections: MapProjections;
  /** Bottom sheet snap state for dynamic padding */
  sheetSnap?: "peek" | "half" | "full";
}

/**
 * Responsive map container:
 * - Desktop: single 960x500 SVG
 * - Mobile: stacked West/East Malaysia, scrollable
 */
export default function ResponsiveMapLayout({
  renderSVGContent,
  overlay,
  onBackgroundClick,
  onMouseLeave,
  projections: p,
  sheetSnap = "half",
}: ResponsiveMapLayoutProps) {
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const tag = (e.target as SVGElement).tagName;
    if ((tag === "svg" || tag === "rect") && onBackgroundClick) {
      onBackgroundClick();
    }
  };

  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
      {/* Desktop */}
      <div className="hidden lg:flex items-center w-full h-full">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-full"
          style={{ background: "transparent" }}
          onMouseLeave={onMouseLeave}
          onClick={handleClick}
        >
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />
          {renderSVGContent(p.allFeatures, p.pathGen, p.projection)}
        </svg>
      </div>

      {/* Mobile: stacked */}
      <div
        className="lg:hidden"
        style={{
          paddingBottom: sheetSnap === "full" ? "92vh"
            : sheetSnap === "half" ? "52vh"
            : "180px",
        }}
      >
        <div className="px-1">
          <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] px-2 pt-2">
            PENINSULAR MALAYSIA
          </div>
          <svg
            viewBox={`0 0 ${M_W} ${M_H_WEST}`}
            className="w-full h-auto"
            style={{ background: "transparent" }}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
          >
            <rect x="0" y="0" width={M_W} height={M_H_WEST} fill="transparent" />
            {renderSVGContent(p.westFeatures, p.westPathGen, p.westProjection)}
          </svg>
        </div>

        <div className="mx-4 border-t border-[rgba(0,212,255,0.08)]" />

        <div className="px-1">
          <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] px-2 pt-2">
            EAST MALAYSIA
          </div>
          <svg
            viewBox={`0 0 ${M_W} ${M_H_EAST}`}
            className="w-full h-auto"
            style={{ background: "transparent" }}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
          >
            <rect x="0" y="0" width={M_W} height={M_H_EAST} fill="transparent" />
            {renderSVGContent(p.eastFeatures, p.eastPathGen, p.eastProjection)}
          </svg>
        </div>
      </div>

      {/* Overlay (tooltips, legends, etc.) */}
      {overlay}
    </div>
  );
}

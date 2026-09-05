"use client";

import { memo, useMemo } from "react";
import { geoGraticule, type geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import neighboursTopo from "@/lib/data/neighbours.json";

type PathGen = ReturnType<typeof geoPath>;
type StateFeature = Feature<Geometry, { Name: string }>;

const NEIGHBOURS = feature(
  neighboursTopo as unknown as Topology,
  (neighboursTopo as unknown as Topology).objects.land as GeometryCollection
);
const GRATICULE = geoGraticule().step([2, 2])();

/** Dim land around Malaysia plus a faint 2° lat/long grid. Draw first, under the states. */
export const ContextLayer = memo(function ContextLayer({ pathGen }: { pathGen: PathGen }) {
  const land = useMemo(() => pathGen(NEIGHBOURS) ?? "", [pathGen]);
  const grid = useMemo(() => pathGen(GRATICULE) ?? "", [pathGen]);
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={grid} fill="none" stroke="rgba(39, 215, 238, 0.07)" strokeWidth={1} />
      <path d={land} fill="rgba(128, 148, 159, 0.09)" stroke="rgba(128, 148, 159, 0.3)" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
});

/** Short labels for territories too small to hold their full name */
const SHORT_LABEL: Record<string, string> = {
  "Kuala Lumpur": "KL",
  Putrajaya: "PJY",
  Labuan: "LBN",
  Perlis: "PLS",
  Melaka: "MLK",
  Penang: "PNG",
  "Negeri Sembilan": "N.SEMBILAN",
};
/** Label nudges in px so tiny territories don't sit on their neighbour's label: [dx, dy] */
const LABEL_NUDGE: Record<string, [number, number]> = {
  "Kuala Lumpur": [8, -10],
  Putrajaya: [-4, 14],
  Selangor: [-26, -4],
  "Negeri Sembilan": [16, 12],
  Penang: [-16, -6],
  Perlis: [-10, -8],
  Labuan: [-14, -10],
  Terengganu: [8, 0],
};

interface LabelLayerProps {
  features: StateFeature[];
  pathGen: PathGen;
  selectedState: string | null;
  hoveredState: string | null;
  fontSize: number;
}

/** State names at each state's centroid. Dim by default, cyan when hovered or selected. */
export const LabelLayer = memo(function LabelLayer({ features, pathGen, selectedState, hoveredState, fontSize }: LabelLayerProps) {
  const labels = useMemo(
    () =>
      features.map((f) => {
        const name = f.properties.Name;
        const [cx, cy] = pathGen.centroid(f);
        const [dx, dy] = LABEL_NUDGE[name] ?? [0, 0];
        return { name, x: cx + dx, y: cy + dy, text: (SHORT_LABEL[name] ?? name).toUpperCase() };
      }),
    [features, pathGen]
  );
  return (
    <g
      style={{ pointerEvents: "none", fontFamily: "var(--font-jetbrains), monospace" }}
      fontSize={fontSize}
      letterSpacing="0.08em"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {labels.map((l) => {
        const on = l.name === selectedState || l.name === hoveredState;
        return (
          <text
            key={l.name}
            x={l.x}
            y={l.y}
            fill={on ? "#27d7ee" : "rgba(233, 241, 245, 0.55)"}
            fontWeight={on ? 700 : 500}
            style={{ paintOrder: "stroke", stroke: "rgba(7, 16, 21, 0.85)", strokeWidth: 3 }}
          >
            {l.text}
          </text>
        );
      })}
    </g>
  );
});

interface ReticleLayerProps {
  features: StateFeature[];
  pathGen: PathGen;
  selectedState: string | null;
}

/** Targeting marks around the selected state: four corner brackets and a slow dashed ring. */
export const ReticleLayer = memo(function ReticleLayer({ features, pathGen, selectedState }: ReticleLayerProps) {
  const box = useMemo(() => {
    const f = features.find((x) => x.properties.Name === selectedState);
    if (!f) return null;
    const [[bx0, by0], [bx1, by1]] = pathGen.bounds(f);
    const [cx, cy] = pathGen.centroid(f);
    // Tiny territories still get a readable reticle
    const half = Math.max((bx1 - bx0) / 2, (by1 - by0) / 2, 12) + 8;
    return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half, cx, cy, r: half * 1.25 + 6 };
  }, [features, pathGen, selectedState]);
  if (!box) return null;
  const L = Math.min(16, (box.x1 - box.x0) / 3);
  const { x0, y0, x1, y1, cx, cy, r } = box;
  const corners = [
    `M${x0 + L},${y0} L${x0},${y0} L${x0},${y0 + L}`,
    `M${x1 - L},${y0} L${x1},${y0} L${x1},${y0 + L}`,
    `M${x0 + L},${y1} L${x0},${y1} L${x0},${y1 - L}`,
    `M${x1 - L},${y1} L${x1},${y1} L${x1},${y1 - L}`,
  ].join(" ");
  return (
    <g style={{ pointerEvents: "none" }} stroke="#27d7ee" fill="none">
      <path d={corners} strokeWidth={1.5} strokeOpacity={0.9} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={1}
        strokeOpacity={0.45}
        strokeDasharray="5 9"
        className="reticle-spin"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
    </g>
  );
});

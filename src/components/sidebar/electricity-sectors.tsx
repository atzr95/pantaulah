"use client";

import { useMemo, useState } from "react";
import type { ElectricitySectorData } from "@/lib/data/types";

interface ElectricitySectorsProps {
  sectors: (ElectricitySectorData & { total: number }) | undefined;
}

const SECTOR_CONFIG = [
  { key: "industrial" as const, label: "Industrial", color: "rgba(255, 180, 50, 0.7)", desc: "Manufacturing plants, factories, and industrial facilities." },
  { key: "commercial" as const, label: "Commercial", color: "rgba(0, 212, 255, 0.7)", desc: "Offices, shopping malls, hotels, restaurants, and commercial buildings." },
  { key: "domestic" as const, label: "Domestic", color: "rgba(100, 200, 120, 0.7)", desc: "Residential households — the electricity you use at home." },
  { key: "mining" as const, label: "Mining", color: "rgba(255, 100, 100, 0.7)", desc: "Mining and quarrying operations including tin, bauxite, and sand." },
  { key: "publicLighting" as const, label: "Public Lighting", color: "rgba(180, 130, 255, 0.7)", desc: "Street lights, highway lighting, and public area illumination." },
  { key: "agriculture" as const, label: "Agriculture", color: "rgba(120, 220, 180, 0.7)", desc: "Irrigation pumps, poultry farms, aquaculture, and agricultural facilities." },
];

export default function ElectricitySectors({ sectors }: ElectricitySectorsProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!sectors) return [];
    const total = sectors.total;
    if (total <= 0) return [];
    return SECTOR_CONFIG
      .map((s) => ({
        ...s,
        value: sectors[s.key] ?? 0,
        pct: ((sectors[s.key] ?? 0) / total) * 100,
      }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [sectors]);

  if (bars.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg)] p-3.5">
      <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2.5">
        CONSUMPTION BY SECTOR
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="relative"
            onMouseEnter={() => setHoveredSector(bar.key)}
            onMouseLeave={() => setHoveredSector(null)}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] text-[var(--color-text)] tracking-wider cursor-help">{bar.label}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {bar.pct >= 10 ? `${bar.pct.toFixed(0)}%` : `${bar.pct.toFixed(1)}%`}
                {" · "}
                {bar.value >= 1000
                  ? `${(bar.value / 1000).toFixed(1)}K`
                  : bar.value.toFixed(1)}
                {" GWh"}
              </span>
            </div>
            <div
              className="h-2 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${bar.pct}%`,
                  background: bar.color,
                }}
              />
            </div>
            {hoveredSector === bar.key && (
              <div
                className="absolute z-50 left-0 right-0 px-2.5 py-1.5 text-[10px] leading-relaxed text-[var(--color-text-muted)] rounded border border-[rgba(0,212,255,0.15)]"
                style={{
                  bottom: "100%",
                  marginBottom: 4,
                  background: "rgba(13, 13, 20, 0.95)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
                }}
              >
                {bar.desc}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

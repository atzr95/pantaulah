"use client";

import { useMemo, useState } from "react";
import type { GdpSectorData } from "@/lib/data/types";

interface GdpSectorsProps {
  sectors: GdpSectorData | undefined;
}

const SECTOR_CONFIG = [
  { key: "services" as const, label: "Services", color: "rgba(0, 212, 255, 0.7)", desc: "Wholesale & retail trade, finance, real estate, government services, education, healthcare, transport & storage, ICT, hospitality." },
  { key: "manufacturing" as const, label: "Manufacturing", color: "rgba(100, 200, 120, 0.7)", desc: "Electronics, petroleum products, rubber & plastics, food processing, metals, machinery, chemicals." },
  { key: "construction" as const, label: "Construction", color: "rgba(255, 180, 50, 0.7)", desc: "Residential & non-residential buildings, civil engineering (roads, bridges, utilities), specialised construction." },
  { key: "agriculture" as const, label: "Agriculture", color: "rgba(180, 130, 255, 0.7)", desc: "Oil palm, rubber, paddy, livestock, forestry & logging, fishing and aquaculture." },
  { key: "mining" as const, label: "Mining", color: "rgba(255, 100, 100, 0.7)", desc: "Crude oil & condensate, natural gas, quarrying (stone, sand, clay)." },
];

export default function GdpSectors({ sectors }: GdpSectorsProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!sectors) return [];
    const total = SECTOR_CONFIG.reduce((sum, s) => sum + (sectors[s.key] ?? 0), 0);
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
        GDP BY SECTOR
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
                {" · RM "}
                {bar.value >= 1000
                  ? `${(bar.value / 1000).toFixed(0)}B`
                  : `${bar.value.toFixed(0)}M`}
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

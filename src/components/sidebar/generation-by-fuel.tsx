"use client";

import { useMemo, useState } from "react";

interface GenerationByFuelProps {
  fuels: Record<string, number> | undefined;
  /** Year shown when the data is older than the selected year */
  vintageYear?: number;
  /** Installed capacity rows (MW) by grid region */
  capacity?: { region: string; mw: number }[];
  capacityVintageYear?: number;
}

const FUEL_CONFIG: Record<string, { color: string; desc: string }> = {
  "Coal": { color: "rgba(255, 100, 100, 0.7)", desc: "Coal-fired thermal plants — Manjung, Tanjung Bin, Jimah East Power." },
  "Natural Gas": { color: "rgba(255, 180, 50, 0.7)", desc: "Combined-cycle and open-cycle gas turbine plants running on piped and LNG gas." },
  "Hydro": { color: "rgba(0, 212, 255, 0.7)", desc: "Hydroelectric dams — Bakun, Murum, Kenyir, Temenggor and others." },
  "Solar": { color: "rgba(255, 220, 100, 0.7)", desc: "Large-scale solar farms (LSS programme) and rooftop photovoltaic systems." },
  "Biomass": { color: "rgba(120, 220, 180, 0.7)", desc: "Power from palm oil residues, wood waste, and other organic matter." },
  "Biogas": { color: "rgba(100, 200, 120, 0.7)", desc: "Methane captured from palm oil mill effluent and landfills." },
  "Diesel/MFO/Distillate": { color: "rgba(180, 130, 255, 0.7)", desc: "Diesel and fuel-oil plants — mostly backup and remote/island generation." },
  "Others": { color: "rgba(150, 150, 160, 0.7)", desc: "Other and unclassified generation sources." },
};

const FALLBACK_COLOR = "rgba(150, 150, 160, 0.7)";

export default function GenerationByFuel({ fuels, vintageYear, capacity, capacityVintageYear }: GenerationByFuelProps) {
  const [hoveredFuel, setHoveredFuel] = useState<string | null>(null);
  const bars = useMemo(() => {
    if (!fuels) return [];
    const total = Object.values(fuels).reduce((sum, v) => sum + v, 0);
    if (total <= 0) return [];
    return Object.entries(fuels)
      .map(([key, value]) => ({
        key,
        label: key,
        value,
        pct: (value / total) * 100,
        color: FUEL_CONFIG[key]?.color ?? FALLBACK_COLOR,
        desc: FUEL_CONFIG[key]?.desc,
      }))
      .filter((b) => b.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [fuels]);

  if (bars.length === 0) return null;

  return (
    <div className="bg-[var(--color-bg)] p-3.5">
      <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2.5">
        GENERATION BY FUEL
        {vintageYear != null && (
          <span className="text-[var(--color-text-dim)]"> ({vintageYear})</span>
        )}
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="relative"
            onMouseEnter={() => setHoveredFuel(bar.key)}
            onMouseLeave={() => setHoveredFuel(null)}
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
            {hoveredFuel === bar.key && bar.desc && (
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

      {capacity && capacity.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-[var(--color-border)]">
          <div className="text-[10px] tracking-[2px] text-[var(--color-text-muted)] mb-2">
            INSTALLED CAPACITY
            {capacityVintageYear != null && (
              <span className="text-[var(--color-text-dim)]"> ({capacityVintageYear})</span>
            )}
          </div>
          <div className="space-y-1">
            {capacity.map((row) => (
              <div key={row.region} className="flex justify-between items-baseline">
                <span className="text-[10px] text-[var(--color-text)] tracking-wider">{row.region}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {row.mw.toLocaleString("en-MY", { maximumFractionDigits: 0 })} MW
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

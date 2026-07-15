"use client";

import PillButton from "@/components/ui/pill-button";

interface TerritoryListProps {
  selectedState: string | null;
  onStateSelect: (topoName: string | null) => void;
}

const SMALL_TERRITORIES = [
  { topoName: "Kuala Lumpur", label: "KL", flag: "kuala_lumpur.svg" },
  { topoName: "Putrajaya", label: "PJY", flag: "putrajaya.svg" },
  { topoName: "Labuan", label: "LBN", flag: "labuan.svg" },
  { topoName: "Perlis", label: "PLS", flag: "perlis.svg" },
  { topoName: "Melaka", label: "MLK", flag: "melaka.svg" },
];

function TerritoryChip({
  territory,
  selectedState,
  onStateSelect,
}: {
  territory: (typeof SMALL_TERRITORIES)[number];
  selectedState: string | null;
  onStateSelect: (topoName: string | null) => void;
}) {
  const { topoName, label, flag } = territory;
  return (
    <PillButton
      active={selectedState === topoName}
      overlay
      aria-label={`Select ${topoName}`}
      onClick={() => onStateSelect(selectedState === topoName ? null : topoName)}
      className="flex items-center gap-1.5 text-left"
    >
      <img
        src={`/flags/${flag}`}
        alt=""
        className="w-4 h-3 object-cover rounded-sm"
        style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
      />
      {label}
    </PillButton>
  );
}

/** Mobile: horizontal quick-select chips, rendered inline in the map scroll content */
export function MobileTerritoryChips({
  selectedState,
  onStateSelect,
}: TerritoryListProps) {
  return (
    <div className="flex lg:hidden gap-1.5 pb-2 overflow-x-auto scrollbar-none">
      {SMALL_TERRITORIES.map((t) => (
        <TerritoryChip
          key={t.topoName}
          territory={t}
          selectedState={selectedState}
          onStateSelect={onStateSelect}
        />
      ))}
    </div>
  );
}

export default function TerritoryList({
  selectedState,
  onStateSelect,
}: TerritoryListProps) {
  return (
    <>
      {/* Desktop: vertical list, bottom-right */}
      <div className="absolute bottom-20 right-4 z-10 hidden lg:flex flex-col gap-1 items-end">
        <div className="type-meta text-[var(--color-text-dim)] mb-0.5">
          QUICK SELECT
        </div>
        {SMALL_TERRITORIES.map((t) => (
          <TerritoryChip
            key={t.topoName}
            territory={t}
            selectedState={selectedState}
            onStateSelect={onStateSelect}
          />
        ))}
      </div>
    </>
  );
}

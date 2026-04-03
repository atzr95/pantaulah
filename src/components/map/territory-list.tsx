"use client";

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

export default function TerritoryList({
  selectedState,
  onStateSelect,
}: TerritoryListProps) {
  return (
    <>
      {/* Desktop: vertical list, bottom-right */}
      <div className="absolute bottom-20 right-4 z-10 hidden lg:flex flex-col gap-1 items-end">
        <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] mb-0.5">
          QUICK SELECT
        </div>
        {SMALL_TERRITORIES.map((t) => (
          <button
            key={t.topoName}
            onClick={() =>
              onStateSelect(selectedState === t.topoName ? null : t.topoName)
            }
            className={`flex items-center gap-2 px-2 py-1 text-[10px] tracking-wider rounded transition-all text-left ${
              selectedState === t.topoName
                ? "bg-[rgba(0,212,255,0.12)] border border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "bg-[rgba(10,10,15,0.7)] backdrop-blur-sm border border-[rgba(0,212,255,0.15)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)]"
            }`}
          >
            <img
              src={`/flags/${t.flag}`}
              alt={t.topoName}
              className="w-4 h-3 object-cover rounded-sm"
              style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
            />
            {t.label}
          </button>
        ))}
      </div>

      {/* Mobile: horizontal chips, above time slider */}
      <div className="absolute bottom-16 left-0 right-0 z-10 flex lg:hidden gap-1.5 px-3 overflow-x-auto scrollbar-none">
        {SMALL_TERRITORIES.map((t) => (
          <button
            key={t.topoName}
            onClick={() =>
              onStateSelect(selectedState === t.topoName ? null : t.topoName)
            }
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider rounded transition-all whitespace-nowrap shrink-0 ${
              selectedState === t.topoName
                ? "bg-[rgba(0,212,255,0.12)] border border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "bg-[rgba(10,10,15,0.8)] backdrop-blur-sm border border-[rgba(0,212,255,0.15)] text-[var(--color-text-muted)]"
            }`}
          >
            <img
              src={`/flags/${t.flag}`}
              alt={t.topoName}
              className="w-4 h-3 object-cover rounded-sm"
              style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)" }}
            />
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

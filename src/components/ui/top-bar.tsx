"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export interface CategoryConfig {
  key: string;
  label: string;
  available: boolean;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: "economy", label: "ECONOMY", available: true },
  { key: "crime", label: "CRIME & SAFETY", available: true },
  { key: "health", label: "HEALTH", available: true },
  { key: "transport", label: "TRANSPORT", available: true },
  { key: "education", label: "EDUCATION", available: true },
  { key: "energy", label: "ENERGY & WATER", available: true },
  { key: "weather", label: "WEATHER", available: true },
  { key: "media", label: "MEDIA", available: true },
];

interface ApiStatus {
  name: string;
  color: string;
}

const API_SOURCES: ApiStatus[] = [
  { name: "DATA.GOV.MY", color: "var(--color-green)" },
  { name: "BNM API", color: "var(--color-green)" },
  { name: "OPEN-METEO", color: "var(--color-green)" },
  { name: "ENERGY API", color: "var(--color-green)" },
];

interface TopBarProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  lastSync: string;
}

export default function TopBar({
  selectedCategory,
  onCategoryChange,
  lastSync,
}: TopBarProps) {
  const [showApiPopover, setShowApiPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const allHealthy = API_SOURCES.every(
    (s) => s.color === "var(--color-green)"
  );
  const summaryColor = allHealthy ? "var(--color-green)" : "var(--color-amber)";
  const healthyCount = API_SOURCES.filter(
    (s) => s.color === "var(--color-green)"
  ).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowApiPopover(false);
      }
    }
    if (showApiPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showApiPopover]);

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        background: "linear-gradient(180deg, #111118 0%, #0d0d14 100%)",
        borderBottom: "1px solid rgba(0, 212, 255, 0.15)",
      }}
    >
      {/* Top row: Logo + System status */}
      <div className="min-h-12 py-2 flex items-center justify-between px-3 md:px-5 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
          <img src="/logo-64.png" alt="PANTAULAH" className="w-7 h-7" />
          <span className="text-[var(--color-cyan)] text-sm md:text-base font-bold tracking-[3px] md:tracking-[4px] text-shadow-lg">
            PANTAULAH
          </span>
          <span className="text-[var(--color-text-muted)] text-[10px] tracking-[2px] ml-3 hidden 2xl:inline">
            MALAYSIA INTELLIGENCE TERMINAL
          </span>
        </div>

        {/* Category tabs — inline on large screens, wrap when needed */}
        <div className="hidden lg:flex flex-wrap gap-1 justify-end">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => cat.available && onCategoryChange(cat.key)}
              disabled={!cat.available}
              className={`px-2.5 py-1 text-[10px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${
                selectedCategory === cat.key
                  ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_10px_rgba(0,212,255,0.1)]"
                  : cat.available
                    ? "border-[rgba(0,212,255,0.25)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.5)] hover:text-[var(--color-text)] cursor-pointer"
                    : "border-[rgba(255,255,255,0.08)] text-[var(--color-text-dim)] opacity-40 cursor-not-allowed"
              }`}
            >
              {cat.label}
              {!cat.available && (
                <span className="ml-1 text-[10px] opacity-60">SOON</span>
              )}
            </button>
          ))}
        </div>

        {/* System status */}
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)] shrink-0">
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowApiPopover((v) => !v)}
              className="flex items-center gap-1.5 hover:text-[var(--color-text)] transition-colors cursor-pointer"
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: summaryColor,
                  boxShadow: `0 0 6px ${summaryColor}`,
                }}
              />
              <span>
                {allHealthy
                  ? "ALL SYSTEMS"
                  : `${healthyCount}/${API_SOURCES.length} APIs`}
              </span>
              <svg
                className={`w-2.5 h-2.5 opacity-50 transition-transform ${showApiPopover ? "rotate-180" : ""}`}
                viewBox="0 0 10 6"
                fill="none"
              >
                <path
                  d="M1 1L5 5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {showApiPopover && (
              <div
                className="absolute right-0 top-full mt-2 py-2 px-3 rounded border border-[rgba(0,212,255,0.2)] z-50 min-w-[160px]"
                style={{
                  background: "rgba(13, 13, 20, 0.95)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
                }}
              >
                <div className="text-[10px] tracking-[1.5px] text-[var(--color-text-dim)] mb-2">
                  API STATUS
                </div>
                <div className="flex flex-col gap-1.5">
                  {API_SOURCES.map((api) => (
                    <div
                      key={api.name}
                      className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]"
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: api.color,
                          boxShadow: `0 0 6px ${api.color}`,
                        }}
                      />
                      {api.name}
                    </div>
                  ))}
                </div>
                <Link
                  href="/about"
                  className="block md:hidden mt-2 pt-2 border-t border-[rgba(0,212,255,0.1)] text-[10px] tracking-[1.5px] text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
                >
                  ABOUT PANTAULAH
                </Link>
              </div>
            )}
          </div>

          <span className="text-[var(--color-text-dim)] opacity-50 hidden md:inline">
            |
          </span>
          <span className="hidden md:inline">SYNC: {lastSync}</span>
          <span className="text-[var(--color-text-dim)] opacity-50 hidden md:inline">
            |
          </span>
          <Link
            href="/about"
            className="hidden md:inline text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
          >
            ABOUT
          </Link>
        </div>
      </div>

      {/* Bottom row: Category tabs on small/medium screens */}
      <div
        className="flex lg:hidden gap-1 px-3 pb-2 flex-wrap"
        style={{ borderTop: "1px solid rgba(0, 212, 255, 0.07)" }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => cat.available && onCategoryChange(cat.key)}
            disabled={!cat.available}
            className={`px-2.5 py-1 text-[10px] tracking-wider border rounded transition-all whitespace-nowrap shrink-0 ${
              selectedCategory === cat.key
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_10px_rgba(0,212,255,0.1)]"
                : cat.available
                  ? "border-[rgba(0,212,255,0.25)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.5)] hover:text-[var(--color-text)] cursor-pointer"
                  : "border-[rgba(255,255,255,0.08)] text-[var(--color-text-dim)] opacity-40 cursor-not-allowed"
            }`}
          >
            {cat.label}
            {!cat.available && (
              <span className="ml-1 text-[10px] opacity-60">SOON</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

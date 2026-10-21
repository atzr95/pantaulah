"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { subscribeFeedStatus, getFeedStatuses } from "@/lib/feed-status";
import { scrollHorizontallyOnWheel } from "@/lib/ui/horizontal-scroll";
import PillButton from "./pill-button";

export interface CategoryConfig {
  key: string;
  label: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: "live", label: "LIVE MAP" },
  { key: "economy", label: "ECONOMY" },
  { key: "crime", label: "CRIME & SAFETY" },
  { key: "health", label: "HEALTH" },
  { key: "transport", label: "TRANSPORT" },
  { key: "education", label: "EDUCATION" },
  { key: "energy", label: "ENERGY & WATER" },
  { key: "weather", label: "WEATHER" },
  { key: "media", label: "MEDIA" },
];

function CategoryTabs({
  selectedCategory,
  onCategoryChange,
}: {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}) {
  return (
    <>
      {CATEGORIES.map((cat) => (
        <PillButton
          key={cat.key}
          active={selectedCategory === cat.key}
          onClick={() => onCategoryChange(cat.key)}
        >
          {cat.label}
        </PillButton>
      ))}
    </>
  );
}

const FEED_LABELS: Record<string, string> = {
  ticker: "NEWS FEED",
  rates: "RATES",
  weather: "WEATHER",
  grid: "WIND / SMOG GRID",
  radar: "RAIN RADAR",
  cctv: "HIGHWAY CCTV",
};

interface TopBarProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  lastSync: string;
  syncStale?: boolean;
}

export default function TopBar({
  selectedCategory,
  onCategoryChange,
  lastSync,
  syncStale,
}: TopBarProps) {
  const [showApiPopover, setShowApiPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const feedStatuses = useSyncExternalStore(
    subscribeFeedStatus,
    getFeedStatuses,
    getFeedStatuses
  );
  const feeds = [...feedStatuses.entries()];
  const allHealthy = feeds.every(([, s]) => s.ok);
  const summaryColor = allHealthy ? "var(--color-green)" : "var(--color-amber)";

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
        background: "linear-gradient(180deg, var(--color-bg-card) 0%, var(--color-bg-panel) 100%)",
        borderBottom: "1px solid var(--color-border-mid)",
      }}
    >
      {/* Top row: Logo + System status */}
      <div className="min-h-12 py-2 flex items-center justify-between px-3 md:px-5 gap-3">
        {/* Logo */}
        <button
          onClick={() => onCategoryChange("live")}
          aria-label="PANTAULAH, go to live map"
          className="flex items-center gap-2 md:gap-2.5 shrink-0 min-h-[44px] lg:min-h-0 cursor-pointer"
        >
          <img src="/logo-64.png" alt="" className="w-7 h-7" />
          <span className="font-mono text-[var(--color-cyan)] text-sm md:text-base font-bold tracking-[0.12em] md:tracking-[0.16em]">
            PANTAULAH
          </span>
          <span className="text-[var(--color-text-muted)] text-xs tracking-[0.08em] ml-3 hidden min-[1800px]:inline">
            MALAYSIA INTELLIGENCE TERMINAL
          </span>
        </button>

        {/* Category tabs — inline and horizontally scrollable on large screens */}
        <div
          className="hidden min-w-0 flex-1 overflow-x-auto overscroll-x-contain scrollbar-none 2xl:block"
          onWheel={scrollHorizontallyOnWheel}
        >
          <div className="ml-auto flex w-max gap-1">
            <CategoryTabs
              selectedCategory={selectedCategory}
              onCategoryChange={onCategoryChange}
            />
          </div>
        </div>

        {/* System status */}
        <div className="font-mono flex items-center gap-3 text-xs text-[var(--color-text-muted)] shrink-0">
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowApiPopover((v) => !v)}
              aria-expanded={showApiPopover}
              aria-label="Feed status"
              className="flex items-center gap-1.5 min-h-[44px] lg:min-h-0 hover:text-[var(--color-text)] transition-colors cursor-pointer"
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: summaryColor }}
              />
              <span>{allHealthy ? "ALL SYSTEMS" : "DEGRADED"}</span>
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
                className="absolute right-0 top-full mt-2 py-2 px-3 rounded border border-[var(--color-border-mid)] z-50 min-w-[160px]"
                style={{
                  background: "rgba(13, 24, 30, 0.98)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
                }}
              >
                <div className="text-xs tracking-[0.06em] text-[var(--color-text-dim)] mb-2">
                  FEED STATUS
                </div>
                <div className="flex flex-col gap-1.5">
                  {feeds.length === 0 ? (
                    <div className="text-xs text-[var(--color-text-dim)]">
                      AWAITING FEEDS...
                    </div>
                  ) : (
                    feeds.map(([feed, status]) => {
                      const color = status.ok
                        ? "var(--color-green)"
                        : "var(--color-red)";
                      return (
                        <div
                          key={feed}
                          className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          {FEED_LABELS[feed] ?? feed.toUpperCase()}
                          {!status.ok && (
                            <span className="text-[var(--color-red)] ml-auto">
                              OFFLINE
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="md:hidden mt-2 pt-2 border-t border-[var(--color-border)] flex flex-col gap-1.5">
                  <div
                    className={`text-xs tracking-[0.06em] ${syncStale ? "text-[var(--color-amber)]" : "text-[var(--color-text-muted)]"}`}
                    title={syncStale ? "Cached data is more than 2 days old" : undefined}
                  >
                    SYNC: {lastSync}
                  </div>
                  <Link
                    href="/about"
                    className="flex items-center min-h-11 text-xs tracking-[0.06em] text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
                  >
                    ABOUT PANTAULAH
                  </Link>
                </div>
              </div>
            )}
          </div>

          <span className="text-[var(--color-text-dim)] opacity-50 hidden md:inline">
            |
          </span>
          <span
            className={`hidden md:inline ${syncStale ? "text-[var(--color-amber)]" : ""}`}
            title={syncStale ? "Cached data is more than 2 days old" : undefined}
          >
            SYNC: {lastSync}
          </span>
          <span className="text-[var(--color-text-dim)] opacity-50 hidden md:inline">
            |
          </span>
          <Link
            href="/about"
            className="hidden md:inline-flex items-center justify-center min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors"
          >
            ABOUT
          </Link>
        </div>
      </div>

      {/* Bottom row: Category tabs below 1536px */}
      <div
        className="flex 2xl:hidden gap-1 overflow-x-auto overscroll-x-contain touch-pan-x px-3 py-1.5 scrollbar-none"
        onWheel={scrollHorizontallyOnWheel}
        style={{ borderTop: "1px solid var(--color-border-faint)" }}
      >
        <CategoryTabs
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
        />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import ResponsiveMapLayout, {
  useMapProjections,
} from "@/components/map/responsive-map-layout";
import MetricToggles from "@/components/map/metric-toggles";
import { LabelLayer } from "@/components/map/map-decor";
import NewsTicker from "@/components/ticker/news-ticker";
import BottomSheet from "@/components/ui/bottom-sheet";
import Dropdown from "@/components/ui/dropdown";
import PillButton from "@/components/ui/pill-button";
import SeriesChart from "@/components/ui/series-chart";
import { SidePanel, PanelHeader, PeekHeader } from "@/components/ui/side-panel";
import {
  computeRankScale,
  getRampColor,
  getRampStroke,
  getRampGradient,
} from "@/lib/data/choropleth";
import type { FoodPriceCache } from "@/lib/data/food-prices";
import foodCache from "@/lib/data/cache/food-prices.json";
import { getFlagSrc } from "@/lib/data/states";
import { useNow } from "@/lib/hooks/use-now";
import { scrollHorizontallyOnWheel } from "@/lib/ui/horizontal-scroll";

const prices = foodCache as FoodPriceCache;

/** "2026-10-20" → "20 OCT 2026" */
function formatPriceDate(date: string): string {
  return new Date(`${date}T00:00:00+08:00`)
    .toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" })
    .toUpperCase();
}

export default function FoodPricesView({
  selectedState,
  onStateSelect,
  onMetricChange,
}: {
  selectedState: string | null;
  onStateSelect: (state: string | null) => void;
  onMetricChange: (metric: string) => void;
}) {
  const [itemCode, setItemCode] = useState(prices.items[0].code);
  const [date, setDate] = useState("");
  // Peek first: the item and date rows already take space above the map on phones
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("peek");
  const projections = useMapProjections();
  const now = useNow();
  const item = prices.items.find((i) => i.code === itemCode)!;
  const dates = useMemo(
    () =>
      [
        ...new Set(
          Object.values(item.states).flatMap((p) => p.map((v) => v.date)),
        ),
      ].sort(),
    [item],
  );
  const selectedDate = dates.includes(date) ? date : dates.at(-1)!;
  const values = Object.fromEntries(
    Object.entries(item.states).map(([state, points]) => [
      state,
      points.find((p) => p.date === selectedDate)?.median,
    ]),
  );
  const scale = computeRankScale(values);
  const statePoints = selectedState ? (item.states[selectedState] ?? []) : [];
  const current = statePoints.find((p) => p.date === selectedDate);
  const stale = now - Date.parse(dates.at(-1)!) > 5 * 86_400_000;
  const header = {
    eyebrow: selectedState ? "STATE INTELLIGENCE BRIEF" : "NATIONAL OVERVIEW",
    context: "ECONOMY",
    title: (selectedState ?? "Malaysia").toUpperCase(),
    flagSrc: getFlagSrc(selectedState),
  };
  const mapLabels = Object.fromEntries(
    Object.entries(values)
      .filter((e): e is [string, number] => e[1] != null)
      .map(([state, value]) => [state, value.toFixed(2)]),
  );
  const details = (
    <div className="p-4 space-y-4 text-sm">
      {selectedState ? (
        <>
          <p className="font-mono text-3xl font-bold text-[var(--color-text-bright)]">
            {current
              ? `RM ${current.median.toFixed(2)}`
              : "No price for this date"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {selectedDate}
            {current && ` · ${current.shops} shops · middle recorded price`}
          </p>
          <SeriesChart
            points={statePoints.map((p) => ({
              time: `${p.date}T00:00:00+08:00`,
              value: p.median,
            }))}
            unit="RM"
          />
          <button
            className="text-xs text-[var(--color-cyan)] min-h-11"
            onClick={() => onStateSelect(null)}
          >
            ALL STATES
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-muted)]">
            Choose a state to see its price, shop count and daily trend.
          </p>
          <div>
            {Object.entries(values)
              .sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity))
              .map(([state, value]) => (
                <button
                  key={state}
                  onClick={() => onStateSelect(state)}
                  className="flex items-center gap-2 w-full min-h-11 lg:min-h-8 px-2 text-xs text-left border-b border-[var(--color-border)] hover:bg-[var(--color-bg-card)]"
                >
                  <Image
                    src={getFlagSrc(state)}
                    alt=""
                    width={16}
                    height={12}
                    className="w-4 h-3 shrink-0 object-cover rounded-sm border border-white/25"
                  />
                  <span className="flex-1 min-w-0 truncate">{state}</span>
                  <span className="shrink-0 font-mono">
                    {value == null ? "No data" : `RM ${value.toFixed(2)}`}
                  </span>
                </button>
              ))}
          </div>
        </>
      )}
      <p className="text-xs text-[var(--color-text-muted)]">
        Source: KPDN / DOSM PriceCatcher. Each state uses the middle price from
        the shops checked that day. Shops and sample sizes can change. This is
        not an inflation measure or a live stock list. Missing dates stay
        missing.
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        Latest source date: {dates.at(-1)}.{" "}
        <a
          href="https://data.gov.my/data-catalogue/pricecatcher"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-cyan)]"
        >
          Source and CC BY 4.0 credit
        </a>
      </p>
    </div>
  );
  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="overflow-x-auto shrink-0 p-2 border-b border-[var(--color-border)]">
        <MetricToggles
          selectedCategory="economy"
          selectedMetric="foodPrice"
          onMetricChange={onMetricChange}
        />
      </div>
      <div
        onWheel={scrollHorizontallyOnWheel}
        className="flex gap-2 p-2 overflow-x-auto shrink-0 border-b border-[var(--color-border)]"
      >
        {prices.items.map((i) => (
          <PillButton
            key={i.code}
            active={i.code === itemCode}
            onClick={() => setItemCode(i.code)}
          >
            {i.name.toUpperCase()} · {i.unit}
          </PillButton>
        ))}
      </div>
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-muted)] shrink-0 border-b border-[var(--color-border)]">
        <Dropdown
          label="Food price date"
          value={selectedDate}
          options={[...dates].reverse().map((d) => ({ value: d, label: formatPriceDate(d) }))}
          onChange={setDate}
        />
        {date && !dates.includes(date) && (
          <span role="status">
            No records for {formatPriceDate(date)}. Showing {formatPriceDate(selectedDate)}.
          </span>
        )}
        {/* Same legend wording as the other metric maps; phones already see the item pill and date */}
        <span className="hidden sm:flex items-baseline gap-2">
          <span className="tracking-[0.08em] text-[var(--color-cyan)]">{item.name.toUpperCase()}</span>
          <span className="tracking-[0.06em] text-[var(--color-text-dim)]">AS OF {formatPriceDate(selectedDate)}</span>
        </span>
        {scale && (
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap">LOW RM {scale.min.toFixed(2)}</span>
            <span
              className="w-20 h-2 rounded-sm"
              style={{ background: getRampGradient("amber") }}
            />
            <span className="whitespace-nowrap">HIGH RM {scale.max.toFixed(2)}</span>
          </span>
        )}
        {stale && (
          <span role="status" className="text-[var(--color-amber)]">
            Source data is more than five days old.
          </span>
        )}
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResponsiveMapLayout
          projections={projections}
          sheetSnap={sheetSnap}
          onBackgroundClick={() => onStateSelect(null)}
          renderSVGContent={(features, path) => (
            <>
              {features.map((f) => {
                const state = f.properties.Name,
                  value = values[state],
                  active = state === selectedState;
                return (
                  <g key={state}>
                    <path
                      d={path(f) ?? ""}
                      fill={getRampColor(scale?.t[state], "amber")}
                      stroke={
                        active
                          ? "var(--color-cyan)"
                          : getRampStroke(scale?.t[state], "amber")
                      }
                      strokeWidth={active ? 2.5 : 1}
                      role="button"
                      tabIndex={0}
                      aria-label={`${state}: ${value == null ? "no price" : `RM ${value.toFixed(2)}`}`}
                      onClick={() => onStateSelect(active ? null : state)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onStateSelect(active ? null : state);
                        }
                      }}
                      className="cursor-pointer"
                    />
                    <title>
                      {state}:{" "}
                      {value == null
                        ? "No data"
                        : `RM ${value.toFixed(2)} per ${item.unit}`}
                    </title>
                  </g>
                );
              })}
              <LabelLayer
                features={features}
                pathGen={path}
                selectedState={selectedState}
                hoveredState={null}
                fontSize={11}
                values={mapLabels}
              />
            </>
          )}
        />
        <SidePanel label="Food price brief">
          <PanelHeader {...header} subtitle={`${item.name} · ${item.unit}`} />
          {details}
        </SidePanel>
      </div>
      <div className="hidden lg:block">
        <NewsTicker />
      </div>
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        peek={
          <PeekHeader
            {...header}
            context={`${item.name.toUpperCase()} · ${current ? `RM ${current.median.toFixed(2)}` : "SELECT A STATE"}`}
          />
        }
      >
        {details}
      </BottomSheet>
    </div>
  );
}

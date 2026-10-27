"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Basemap, LayerKey, Selection } from "@/components/live/live-map";
import { useEnvironment } from "@/lib/hooks/use-environment";
import { useNow } from "@/lib/hooks/use-now";
import {
  ENVIRONMENT_COLORS,
  FIRE_HEAT_GRADIENT,
  observationTime,
  currentEnvironmentSelection,
  type EnvironmentSelection,
} from "@/lib/data/environment";
import { currentHourIndex, type LiveGrid } from "@/lib/live/grid-field";
import { RAINVIEWER_FRAMES, type RainViewerIndex } from "@/lib/live/tiles";
import { getFlagSrc } from "@/lib/data/states";
import BottomSheet from "@/components/ui/bottom-sheet";
import PillButton from "@/components/ui/pill-button";
import { SidePanel, PanelHeader, PeekHeader } from "@/components/ui/side-panel";
import EnvironmentDialog from "./environment-dialog";

const LiveMap = dynamic(() => import("@/components/live/live-map"), {
  ssr: false,
});
const EMPTY: never[] = [];
// Legend shapes matching the map's river drop and shelter house icons.
const DROP_PATH = "M5 0C6.5 2.5 9 4.5 9 7a4 4 0 0 1-8 0C1 4.5 3.5 2.5 5 0z";
const HOUSE_PATH = "M5 0l5 4.5H8.5V10h-7V4.5H0z";

/**
 * Rivers & Floods / Fire & Haze inside the Weather tab. Uses the same frame as the
 * other weather sub-tabs: `top` (banner, mobile tabs, live strip) above the map,
 * `tabs` floating at the map's top-right on desktop, the side panel on the right
 * and the bottom sheet on phones.
 */
export default function EnvironmentView({
  mode,
  top,
  tabs,
}: {
  mode: "rivers" | "air";
  top: ReactNode;
  /** Desktop overlay rows (each a flex row of pills) */
  tabs: ReactNode;
}) {
  const [layers, setLayers] = useState({
    rivers: mode === "rivers",
    shelters: mode === "rivers",
    fires: mode === "air",
    radar: mode === "rivers",
    smog: mode === "air",
    // On with fires so people can see where the smoke will drift.
    wind: mode === "air",
    haze: false,
  });
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [selection, setSelection] = useState<EnvironmentSelection | null>(null);
  const [search, setSearch] = useState("");
  const [fireDays, setFireDays] = useState(7);
  const [grid, setGrid] = useState<LiveGrid | null>(null);
  const [radar, setRadar] = useState<RainViewerIndex | null>(null);
  const [radarIndex, setRadarIndex] = useState<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  // Peek first so the map stays visible on phones
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("peek");
  const sources = useEnvironment(layers);
  const now = useNow();
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          mode === "rivers" ? RAINVIEWER_FRAMES : "/api/live/grid",
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) {
          if (mode === "rivers") setRadar(data);
          else setGrid(data);
          setMapError(null);
        }
      } catch {
        if (!cancelled)
          setMapError(
            mode === "rivers"
              ? "Rain images unavailable"
              : "Wind and air model unavailable",
          );
      }
    };
    void load();
    const timer = setInterval(load, mode === "rivers" ? 300_000 : 3_600_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mode]);
  const riverData = sources.rivers.data,
    shelterData = sources.shelters.data,
    fireData = sources.fires.data,
    firesFetchedAt = sources.fires.fetchedAt;
  const currentSelection = currentEnvironmentSelection(selection, {
    rivers: riverData,
    shelters: shelterData,
    fires: fireData,
  });
  const rivers = useMemo(
    () =>
      (riverData ?? [])
        .filter(
          (r) =>
            now - Date.parse(r.observedAt) <= 3_600_000 &&
            `${r.name} ${r.state} ${r.district}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            ["Danger", "Warning", "Alert", "Normal", "Unknown"].indexOf(
              a.status,
            ) -
            ["Danger", "Warning", "Alert", "Normal", "Unknown"].indexOf(
              b.status,
            ),
        ),
    [riverData, search, now],
  );
  const shelters = useMemo(
    () =>
      (shelterData ?? []).filter((s) =>
        `${s.name} ${s.state} ${s.district}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [shelterData, search],
  );
  // Age from fetch time, not the 30s clock: a new array would re-cluster every fire point.
  const fires = useMemo(
    () =>
      (fireData ?? [])
        .filter(
          (f) =>
            Date.parse(firesFetchedAt ?? "") - Date.parse(f.observedAt) <=
            fireDays * 86_400_000,
        )
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt)),
    [fireData, firesFetchedAt, fireDays],
  );
  const frames = radar?.radar.past ?? [];
  const frameIndex = Math.min(
    radarIndex ?? Math.max(0, frames.length - 1),
    Math.max(0, frames.length - 1),
  );
  const toggle = (key: keyof typeof layers) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  const onSelect = (s: Selection | null) => {
    if (s?.kind === "river" || s?.kind === "shelter" || s?.kind === "fire")
      setSelection(s);
  };
  const controls: { key: keyof typeof layers; label: string }[] =
    mode === "rivers"
      ? [
          { key: "rivers", label: "RIVERS" },
          { key: "shelters", label: "SHELTERS" },
          { key: "radar", label: "RAIN" },
        ]
      : [
          { key: "fires", label: "FIRE DETECTIONS" },
          { key: "smog", label: "AIR PARTICLES" },
          { key: "wind", label: "WIND" },
          { key: "haze", label: "SATELLITE HAZE" },
        ];
  // Side content: desktop side panel and phone bottom sheet show the same list
  const side = (
    <div className="p-4 space-y-3 text-xs">
      <p className="text-[var(--color-text-muted)]">
        {mode === "rivers"
          ? "River readings from the last hour. Tap a station for seven-day history. Shelter counts follow JKM reports."
          : "Heat detections in Malaysia and most of Indonesia. Detections are not confirmed fires. Wind alone cannot prove the source of haze."}
      </p>
      {mode === "rivers" && (
        <input
          aria-label="Find river or shelter"
          type="search"
          placeholder="Find a station, state or district"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-h-11 rounded-md border border-[var(--color-border-mid)] bg-[var(--color-bg)] p-2"
        />
      )}
      {controls
        .filter(
          (c) =>
            c.key === "rivers" || c.key === "shelters" || c.key === "fires",
        )
        .filter((c) => layers[c.key])
        .map((c) => {
          const source = sources[c.key as keyof typeof sources];
          return (
            <p
              key={c.key}
              role="status"
              className={
                source.error
                  ? "text-[var(--color-amber)]"
                  : "text-[var(--color-text-muted)]"
              }
            >
              {c.label}:{" "}
              {source.error ??
                (!source.data
                  ? "Loading…"
                  : `${c.key === "rivers" ? rivers.length : c.key === "shelters" ? shelters.length : fires.length} records`)}
              {source.fetchedAt &&
                ` · retrieved ${observationTime(source.fetchedAt)}`}
            </p>
          );
        })}
      {layers.shelters && (
        <>
          <h3 className="pt-1 tracking-[0.08em] text-[var(--color-cyan)]">OPEN SHELTERS</h3>
          {shelters.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelection({ kind: "shelter", data: s })}
              className="block w-full rounded border border-[var(--color-border)] p-3 text-left hover:border-[var(--color-border-hover)]"
            >
              <strong>{s.name}</strong>
              <p className="mt-1 text-[var(--color-text-muted)]">
                {s.state} · {s.people} people · {s.capacityUsed.toFixed(1)}%
                used
              </p>
            </button>
          ))}
          {sources.shelters.data && !shelters.length && (
            <p>No open shelters match this view.</p>
          )}
        </>
      )}
      {layers.rivers && (
        <>
          <h3 className="pt-1 tracking-[0.08em] text-[var(--color-cyan)]">RIVER STATIONS</h3>
          {rivers.some(r => r.lat === null || r.lon === null) && (
            <p className="text-[var(--color-text-muted)]">JPS does not provide locations in this feed. Stations without locations appear in this list only.</p>
          )}
          {rivers.slice(0, 40).map((r) => (
            <button
              key={r.id}
              onClick={() => setSelection({ kind: "river", data: r })}
              className="block w-full rounded border border-[var(--color-border)] p-3 text-left hover:border-[var(--color-border-hover)]"
            >
              <strong>{r.name}</strong>
              <p
                className="mt-1"
                style={{ color: ENVIRONMENT_COLORS[r.status] }}
              >
                {r.level.toFixed(2)} m · {r.status}
              </p>
              <p className="mt-1 text-[var(--color-text-muted)]">
                {r.state} · {observationTime(r.observedAt)}
              </p>
            </button>
          ))}
          {rivers.length > 40 && (
            <p>
              Showing the first 40 stations. Use search to narrow the list.
            </p>
          )}
          {sources.rivers.data && !rivers.length && (
            <p>No recent stations match this view.</p>
          )}
        </>
      )}
      {layers.fires && (
        <>
          <h3 className="pt-1 tracking-[0.08em] text-[var(--color-cyan)]">RECENT DETECTIONS</h3>
          {fires.slice(0, 30).map((f) => (
            <button
              key={f.id}
              onClick={() => setSelection({ kind: "fire", data: f })}
              className="block w-full rounded border border-[var(--color-border)] p-3 text-left hover:border-[var(--color-border-hover)]"
            >
              {f.lat.toFixed(3)}, {f.lon.toFixed(3)}
              <p className="mt-1 text-[var(--color-text-muted)]">
                {observationTime(f.observedAt)} · {f.confidence}
              </p>
            </button>
          ))}
          {fires.length > 30 && (
            <p>
              Latest 30 shown here. All matching detections are on the map.
            </p>
          )}
          {sources.fires.data && !fires.length && (
            <p>No detections in this time range.</p>
          )}
        </>
      )}
      {/* Link only: the report image is 6000×7000 px, too much memory for phones. */}
      {mode === "air" && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <a
            href="https://wis2.asmc.asean.org/regional-haze-situation/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 text-[var(--color-cyan)]"
          >
            Open the daily ASMC regional haze report
          </a>
          <p className="text-[var(--color-text-muted)]">
            Use the date printed in the report. Clouds can hide fires and
            haze.
          </p>
        </div>
      )}
    </div>
  );
  const layerPills = (
    <>
      {controls.map((c) => (
        <PillButton
          key={c.key}
          overlay
          active={layers[c.key]}
          onClick={() => toggle(c.key)}
        >
          {c.label}
        </PillButton>
      ))}
      <PillButton
        overlay
        active={basemap === "satellite"}
        onClick={() =>
          setBasemap((b) => (b === "dark" ? "satellite" : "dark"))
        }
      >
        SATELLITE MAP
      </PillButton>
    </>
  );
  const header = {
    eyebrow: mode === "rivers" ? "RIVERS & FLOODS" : "FIRE & HAZE",
    context: mode === "rivers" ? "JPS / JKM" : "NASA FIRMS",
    title: "MALAYSIA",
    flagSrc: getFlagSrc(null),
  };
  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative flex flex-col min-h-0 min-w-0 overflow-hidden">
          {top}
          {/* Mobile: layer toggles under the tab strip, like the forecast day row */}
          <div className="lg:hidden flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0 border-b border-[var(--color-border)]">
            {layerPills}
          </div>
        <div className="flex-1 relative min-h-0 min-w-0">
          <LiveMap
            layers={layers as Partial<Record<LayerKey, boolean>>}
            basemap={basemap}
            hour={grid ? currentHourIndex(grid) : 0}
            grid={grid}
            radar={radar ? { host: radar.host, frames } : null}
            radarIndex={frameIndex}
            flights={EMPTY}
            transit={EMPTY}
            quakes={EMPTY}
            news={EMPTY}
            cctv={EMPTY}
            rivers={layers.rivers ? rivers : EMPTY}
            shelters={layers.shelters ? shelters : EMPTY}
            fires={layers.fires ? (fireData ?? EMPTY) : EMPTY}
            fireCutoff={Date.parse(firesFetchedAt ?? "") - fireDays * 86_400_000}
            selection={selection}
            onSelect={onSelect}
          />
          {/* Legend: above the peeking bottom sheet on phones, above the map credits on desktop */}
          <div className="absolute bottom-[132px] lg:bottom-11 left-3 right-3 lg:right-14 max-w-sm text-xs rounded bg-[var(--color-bg-panel)]/95 p-3 border border-[var(--color-border)] space-y-2">
            {mode === "rivers" ? (
              <>
                {/* Same shapes as the map: drops for raised levels, faint dots, house. */}
                <div className="flex flex-wrap gap-3">
                  {(["Danger", "Warning", "Alert"] as const).map((s) => (
                    <span
                      key={s}
                      className="flex items-center gap-1"
                      style={{ color: ENVIRONMENT_COLORS[s] }}
                    >
                      <svg viewBox="0 0 10 11" className="w-2.5 h-3" aria-hidden>
                        <path d={DROP_PATH} fill="currentColor" />
                      </svg>
                      {s}
                    </span>
                  ))}
                  {(["Normal", "Unknown"] as const).map((s) => (
                    <span key={s} style={{ color: ENVIRONMENT_COLORS[s] }}>
                      • {s}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 text-violet-400">
                    <svg viewBox="0 0 10 10" className="w-3 h-3" aria-hidden>
                      <path d={HOUSE_PATH} fill="currentColor" />
                    </svg>
                    Shelter
                  </span>
                </div>
                {layers.radar && (
                  <label className="flex items-center gap-2">
                    RAIN
                    <input
                      aria-label="River map rain time"
                      type="range"
                      min="0"
                      max={Math.max(0, frames.length - 1)}
                      value={frameIndex}
                      onChange={(e) => setRadarIndex(Number(e.target.value))}
                      className="w-24 min-w-0 accent-[var(--color-cyan)]"
                    />
                    <span>
                      {frames[frameIndex]
                        ? observationTime(
                            new Date(
                              frames[frameIndex].time * 1000,
                            ).toISOString(),
                          )
                        : "Loading…"}
                    </span>
                  </label>
                )}
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-[var(--color-text-muted)]">
                  <span
                    className="h-2 w-16 shrink-0 rounded"
                    style={{ background: FIRE_HEAT_GRADIENT }}
                  />
                  Fewer → more detections · zoom in to tap one
                </p>
                {layers.wind && (
                  <p className="text-[var(--color-text-muted)]">
                    White arrows: where wind and smoke go · bigger = stronger
                  </p>
                )}
                <label className="flex flex-wrap items-center gap-2">
                  LAST {fireDays} DAYS
                  <input
                    aria-label="Weather fire detection days"
                    type="range"
                    min="1"
                    max="7"
                    value={fireDays}
                    onChange={(e) => setFireDays(Number(e.target.value))}
                    className="w-28 accent-[var(--color-cyan)]"
                  />
                  <span>
                    {sources.fires.data
                      ? `${fires.length} regional detections`
                      : sources.fires.error
                        ? "Unavailable"
                        : "Loading…"}
                  </span>
                </label>
              </>
            )}
            {mapError && (
              <p role="status" className="text-[var(--color-amber)]">
                {mapError}
              </p>
            )}
          </div>
          {/* Desktop: sub-tabs and layer toggles in the same top-right spot as the other weather sub-tabs */}
          <div className="absolute top-4 right-4 hidden lg:flex flex-col items-end gap-1.5 z-10">
            {tabs}
            <div className="flex gap-1.5">{layerPills}</div>
          </div>
        </div>
        </div>
        <SidePanel label={header.eyebrow}>
          <PanelHeader {...header} subtitle="Tap a map point or a list item for details" />
          {side}
        </SidePanel>
      </div>
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        peek={
          <PeekHeader
            {...header}
            aside={
              <div className="text-xs tracking-[0.06em] text-[var(--color-cyan)]">
                {mode === "rivers" ? `${rivers.length} STATIONS` : `${fires.length} DETECTIONS`}
              </div>
            }
          />
        }
      >
        {side}
      </BottomSheet>
      {currentSelection && (
        <EnvironmentDialog
          {...currentSelection}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}

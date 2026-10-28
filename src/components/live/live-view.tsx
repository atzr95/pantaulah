"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useFlights, type Flight } from "@/lib/hooks/use-flights";
import { useTransit, type TransitVehicle } from "@/lib/hooks/use-transit";
import { reportFeedStatus } from "@/lib/feed-status";
import type { EarthquakeEntry, WeatherData } from "@/lib/data/weather-types";
import type { RssItem } from "@/app/api/rss/route";
import type { FlightRoute } from "@/app/api/live/flight-route/route";
import { matchTown } from "@/lib/live/towns";
import { currentHourIndex, smogScale, SMOG_GRADIENT, type LiveGrid } from "@/lib/live/grid-field";
import { RAINVIEWER_FRAMES, type RainViewerIndex, type RadarFrame } from "@/lib/live/tiles";
import cctvCoords from "@/lib/data/cctv-coords.json";
import type { LayerKey, Basemap, Selection, NewsPin, CctvPin } from "./live-map";
import PillButton from "@/components/ui/pill-button";
import { SidePanel, PanelHeader } from "@/components/ui/side-panel";
import LayerControls, { DEFAULT_LAYERS } from "./layer-controls";
import { useEnvironment } from "@/lib/hooks/use-environment";
import { useNow } from "@/lib/hooks/use-now";
import EnvironmentDialog from "@/components/weather/environment-dialog";
import { currentEnvironmentSelection, FIRE_HEAT_GRADIENT, type EnvironmentSelection } from "@/lib/data/environment";

const LiveMap = dynamic(() => import("./live-map"), { ssr: false });

export default function LiveView() {
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [grid, setGrid] = useState<LiveGrid | null>(null);
  const [liveHour, setLiveHour] = useState(0);
  // Smog, cloud and wind follow the current hour ("live"). Dragging or playing pins an hour
  // by its timestamp (an index would drift when the grid refreshes); LIVE snaps back.
  const [gridPinned, setGridPinned] = useState<string | null>(null);
  const [gridPlaying, setGridPlaying] = useState(false);
  // `past` = number of observed frames; anything after is nowcast (forecast)
  const [radar, setRadar] = useState<{ host: string; frames: RadarFrame[]; past: number } | null>(null);
  // Radar shows the newest observed frame and follows new frames as they arrive ("live").
  // Dragging the slider pins a frame by its timestamp (an index would drift when the
  // frame list refreshes); LIVE snaps back.
  const [radarRewind, setRadarRewind] = useState<number | null>(null);
  const [quakes, setQuakes] = useState<EarthquakeEntry[]>([]);
  const [news, setNews] = useState<NewsPin[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [environmentSelection, setEnvironmentSelection] = useState<EnvironmentSelection | null>(null);
  const [treeYear, setTreeYear] = useState(2025);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fireDays, setFireDays] = useState(7);
  const [followKey, setFollowKey] = useState<string | null>(null);
  const environment = useEnvironment(layers);
  const now = useNow();
  const currentEnvironment = currentEnvironmentSelection(environmentSelection, { rivers: environment.rivers.data, shelters: environment.shelters.data, fires: environment.fires.data });
  const riverData = environment.rivers.data;
  const recentRivers = useMemo(() => (riverData ?? []).filter((r) => now - Date.parse(r.observedAt) <= 3_600_000), [riverData, now]);
  const { data: fireData, fetchedAt: firesFetchedAt } = environment.fires;
  // Age from fetch time, not the 30s clock, so the cutoff only moves with the slider or new data.
  const fireCutoff = Date.parse(firesFetchedAt ?? "") - fireDays * 86_400_000;
  const visibleFireCount = useMemo(() => (fireData ?? []).filter((f) => Date.parse(f.observedAt) >= fireCutoff).length, [fireData, fireCutoff]);

  const flights = useFlights(layers.flights);
  const transit = useTransit(layers.transit);

  // CCTV: LLM rotates which cameras it publishes, so pin only cameras that are live
  // right now AND have known coordinates. Refreshed every 4 min (server caches ~4 min too).
  const [cctv, setCctv] = useState<CctvPin[]>([]);
  useEffect(() => {
    const coords = cctvCoords as Record<string, { lat: number; lon: number; highway: string; approx?: boolean }>;
    const load = async () => {
      try {
        const { highways } = (await (await fetch("/api/cctv")).json()) as { highways: { code: string }[] };
        const lists = await Promise.all(
          highways.map((h) => fetch(`/api/cctv?h=${h.code}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
        );
        const pins: CctvPin[] = [];
        const unknown: string[] = [];
        lists.forEach((d: { highway: string; cameras: { name: string; image: string }[] } | null) => {
          for (const cam of d?.cameras ?? []) {
            const c = coords[cam.name];
            if (c) pins.push({ name: cam.name, image: cam.image, ...c });
            else unknown.push(cam.name);
          }
        });
        if (unknown.length && process.env.NODE_ENV !== "production") console.info("[cctv] no coordinates for:", unknown);
        setCctv(pins);
        reportFeedStatus("cctv", true);
      } catch {
        reportFeedStatus("cctv", false);
      }
    };
    load();
    const t = setInterval(load, 240_000);
    return () => clearInterval(t);
  }, []);

  // Weather/air grid (3h server cache) — smog/cloud/wind show the current hour unless pinned;
  // grid re-fetched hourly (also retries a failed load), current hour re-picked every 15 min
  useEffect(() => {
    const load = () =>
      fetch("/api/live/grid")
        .then((r) => { reportFeedStatus("grid", r.ok); return r.ok ? r.json() : null; })
        .then((g: LiveGrid | null) => { if (g) { setGrid(g); setLiveHour(currentHourIndex(g)); } })
        .catch(() => reportFeedStatus("grid", false));
    load();
    const t = setInterval(load, 3_600_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!grid) return;
    const t = setInterval(() => setLiveHour(currentHourIndex(grid)), 900_000);
    return () => clearInterval(t);
  }, [grid]);

  const gridOn = layers.smog || layers.cloud || layers.wind;
  const gridLast = Math.max(0, (grid?.times.length ?? 1) - 1);
  const pinnedAt = gridPinned === null ? -1 : (grid?.times.indexOf(gridPinned) ?? -1);
  // A pinned hour that has aged out of the grid falls back to now
  const hour = pinnedAt >= 0 ? pinnedAt : liveHour;
  // Playback steps one hour at a time through the whole window, then wraps
  useEffect(() => {
    if (!gridPlaying || !gridOn || !grid) return;
    const t = setInterval(() => setGridPinned((pin) => {
      const i = pin === null ? -1 : grid.times.indexOf(pin);
      return grid.times[((i < 0 ? liveHour : i) + 1) % grid.times.length];
    }), 800);
    return () => clearInterval(t);
  }, [gridPlaying, gridOn, grid, liveHour]);
  const gridTime = grid?.times[hour];
  const gridLabel = gridTime ? new Date(gridTime + "Z").toLocaleString("en-MY", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kuala_Lumpur" }) : "--:--";
  const gridOffset = hour - liveHour;

  // Radar frame index from RainViewer, refreshed every 5 min
  useEffect(() => {
    const load = () =>
      fetch(RAINVIEWER_FRAMES)
        .then((r) => { reportFeedStatus("radar", r.ok); return r.ok ? r.json() : null; })
        .then((idx: RainViewerIndex | null) => {
          // nowcast can be missing or empty; keep the previous index rather than an empty one
          const past = idx?.radar?.past ?? [];
          const frames = [...past, ...(idx?.radar?.nowcast ?? [])];
          if (idx && frames.length) setRadar({ host: idx.host, frames, past: past.length });
        })
        .catch(() => reportFeedStatus("radar", false));
    load();
    const t = setInterval(load, 300_000);
    return () => clearInterval(t);
  }, []);

  const radarLast = Math.max(0, (radar?.frames.length ?? 1) - 1);
  // LIVE = newest observed frame, never a nowcast one
  const radarLive = radar ? Math.max(0, Math.min(radar.past, radar.frames.length) - 1) : 0;
  const rewoundTo = radarRewind === null ? -1 : (radar?.frames.findIndex((f) => f.time === radarRewind) ?? -1);
  // A pinned frame that has aged out of the list falls back to the oldest one
  const radarIndex = radarRewind === null ? radarLive : rewoundTo >= 0 ? rewoundTo : 0;
  const radarIsForecast = radarIndex > radarLive;

  // Earthquakes come with the existing weather payload; refreshed every 10 min
  useEffect(() => {
    const load = () =>
      fetch("/api/weather")
        .then((r) => (r.ok ? r.json() : null))
        .then((w: WeatherData | null) => {
          reportFeedStatus("weather", w?.feedStatus?.warnings === true && w?.feedStatus?.floods === true);
          if (w?.earthquakes) setQuakes(w.earthquakes);
        })
        .catch(() => reportFeedStatus("weather", false));
    load();
    const t = setInterval(load, 600_000);
    return () => clearInterval(t);
  }, []);

  // News pins: group headlines by the first town they mention; refreshed every 10 min
  useEffect(() => {
    const load = () =>
      fetch("/api/rss")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { items: RssItem[] } | null) => {
          if (!d) return;
          const byTown = new Map<string, NewsPin>();
          for (const it of d.items) {
            const t = matchTown(it.title);
            if (!t) continue;
            const pin = byTown.get(t.name) ?? { name: t.name, lat: t.lat, lon: t.lon, headlines: [] };
            if (pin.headlines.length < 8) pin.headlines.push({ title: it.title, link: it.link, source: it.sourceName });
            byTown.set(t.name, pin);
          }
          setNews([...byTown.values()]);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 600_000);
    return () => clearInterval(t);
  }, []);

  const changeLayers = useCallback((next: Record<LayerKey, boolean>) => {
    setLayers(next);
    if (next.treeLoss && !layers.treeLoss) setBasemap("satellite");
  }, [layers.treeLoss]);
  const onSelect = useCallback((s: Selection | null) => {
    if (s?.kind === "river" || s?.kind === "shelter" || s?.kind === "fire") { setEnvironmentSelection(s); return; }
    setSelection(s); if (s) setPanelOpen(true);
    // A tap on the vehicle being followed keeps following; anything else stops it.
    setFollowKey((key) => s?.kind === "transit" && key === `${s.data.feed}::${s.data.id}` ? key : null);
  }, []);
  const currentVehicle = selection?.kind === "transit" ? transit.find((v) => v.feed === selection.data.feed && v.id === selection.data.id) : null;
  const liveSelection = selection?.kind === "transit" && currentVehicle ? { ...selection, data: currentVehicle } : selection;
  const followControls = liveSelection?.kind === "transit" && <TransitFollowControls vehicle={currentVehicle ?? null} following={!!followKey}
    onToggle={() => setFollowKey(followKey ? null : `${liveSelection.data.feed}::${liveSelection.data.id}`)} />;

  const radarTime = radar?.frames[radarIndex]?.time;
  const radarLabel = radarTime ? new Date(radarTime * 1000).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--";

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      <div className="lg:hidden">
        <LayerControls layers={layers} onChange={changeLayers} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <LiveMap
          layers={layers} basemap={basemap} hour={hour} grid={grid} radar={radar} radarIndex={radarIndex}
          flights={flights} transit={transit} quakes={quakes} news={news} cctv={cctv} selection={selection} onSelect={onSelect}
          rivers={recentRivers} shelters={environment.shelters.data ?? []} fires={fireData ?? undefined} fireCutoff={fireCutoff} treeYear={treeYear} onTreeLossLoading={setTreeLoading} followKey={layers.transit ? followKey : null}
        />

        {/* Top-left: basemap + time controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-1.5rem)]">
          <div className="flex gap-1 p-1 rounded w-max" style={{ background: HUD_BG }}>
            <PillButton active={basemap === "dark"} onClick={() => setBasemap("dark")}>DARK</PillButton>
            <PillButton active={basemap === "satellite"} onClick={() => setBasemap("satellite")}>SATELLITE</PillButton>
          </div>
          {layers.radar && <Hud>
            <Row label="RADAR" value={radarRewind === null ? `${radarLabel} LIVE` : radarIsForecast ? `${radarLabel} FORECAST` : radarLabel}>
              <input type="range" min={0} max={radarLast} value={radarIndex}
                onChange={(e) => { const i = +e.target.value; setRadarRewind(i === radarLive ? null : radar?.frames[i]?.time ?? null); }} className="w-24 md:w-32 accent-[var(--color-cyan)]" aria-label="Radar frame" />
              {radarRewind !== null && (
                <button onClick={() => setRadarRewind(null)} className="text-[var(--color-amber)] hover:text-[var(--color-text-bright)] tracking-[0.08em]" aria-label="Back to live radar">LIVE</button>
              )}
            </Row>
          </Hud>}
          {gridOn && grid && <Hud>
            <Row label="HOUR" value={`${gridLabel} ${gridOffset === 0 ? "NOW" : `${gridOffset > 0 ? "+" : "−"}${Math.abs(gridOffset)}h`}`}>
              <button onClick={() => setGridPlaying(!gridPlaying)} className="w-5 text-[var(--color-cyan)] hover:text-[var(--color-text-bright)]" aria-label={gridPlaying ? "Pause forecast" : "Play forecast"}>{gridPlaying ? "❚❚" : "▶"}</button>
              <input type="range" min={0} max={gridLast} value={hour}
                onChange={(e) => { const i = +e.target.value; setGridPlaying(false); setGridPinned(i === liveHour ? null : grid.times[i] ?? null); }} className="w-24 md:w-32 accent-[var(--color-cyan)]" aria-label="Forecast hour" />
              {gridPinned !== null && (
                <button onClick={() => { setGridPinned(null); setGridPlaying(false); }} className="text-[var(--color-amber)] hover:text-[var(--color-text-bright)] tracking-[0.08em]" aria-label="Back to current hour">LIVE</button>
              )}
            </Row>
            {layers.smog && <div className="text-[11px] text-[var(--color-text-muted)]">
              <span>SMOG · PM2.5 µg/m³</span>
              <div className="h-2 w-48 mt-1 rounded" style={{ background: SMOG_GRADIENT }} />
              <div className="relative h-3 w-48 tabular-nums">
                {[15, 50, 150, 500].map((v) => <span key={v} className="absolute -translate-x-1/2" style={{ left: `${smogScale(v) * 100}%` }}>{v}</span>)}
              </div>
            </div>}
          </Hud>}
          {layers.wind && <Hud><p className="text-[11px] text-[var(--color-text-muted)] max-w-[16rem]">WIND · white arrows: where wind and smoke go · bigger = stronger</p></Hud>}
          {layers.treeLoss && <Hud><label className="flex flex-wrap items-center gap-2 text-xs"><span>TREE LOSS · {treeYear}</span><input aria-label="Tree loss year" type="range" min="2001" max="2025" value={treeYear} onChange={(e) => setTreeYear(Number(e.target.value))} className="w-32 accent-[var(--color-cyan)]" /></label><p className="text-[11px] text-[var(--color-text-muted)]"><span className="text-[#e85a9c]">■ Pink: tree loss in {treeYear}</span>{treeLoading && <span role="status" className="text-[var(--color-amber)]"> · loading…</span>}<br />Annual estimate · not proof of illegal logging</p></Hud>}
          {layers.fires && <Hud><label className="flex flex-wrap items-center gap-2 text-xs"><span>FIRES · LAST {fireDays} DAYS</span><input aria-label="Fire detection days" type="range" min="1" max="7" value={fireDays} onChange={(e) => setFireDays(Number(e.target.value))} className="w-24 accent-[var(--color-cyan)]" /></label><p className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]"><span className="h-2 w-16 shrink-0 rounded" style={{ background: FIRE_HEAT_GRADIENT }} />Weaker, fewer → hotter, denser fires · zoom in to tap one</p></Hud>}
          {(Object.keys(environment) as (keyof typeof environment)[]).filter((key) => layers[key]).map((key) => <div key={key} role="status" className="text-xs bg-[var(--color-bg-panel)] px-2 py-1 rounded max-w-xs">{key.toUpperCase()}: {environment[key].error ?? (environment[key].data ? key === "rivers" ? `${recentRivers.length} readings · ${recentRivers.filter(r => r.lat !== null && r.lon !== null).length} map locations. See Weather → Rivers & Floods for the list.` : `${key === "fires" ? visibleFireCount : environment[key].data.length} ${key === "fires" ? "regional detections" : "locations"}` : "Loading…")}</div>)}
        </div>

        {/* Bottom: live counters */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <Hud>
            <div className="flex gap-3 text-xs">
              <Stat color="var(--color-poi-flight)" label="AIRCRAFT" value={flights.length} />
              <Stat color="var(--color-amber)" label="MIL" value={flights.filter((f) => f.military).length} />
              <Stat color="var(--color-poi-bus)" label="TRANSIT" value={transit.length} />
              <Stat color="var(--color-cyan)" label="NEWS" value={news.reduce((n, p) => n + p.headlines.length, 0)} />
            </div>
          </Hud>
        </div>

      </div>

      {/* Desktop sidebar: quick views, layers and selection */}
      <SidePanel label="Map controls">
        <PanelHeader eyebrow="LIVE MAP" context="REAL-TIME" title="MALAYSIA" subtitle="Aircraft, transit, weather and hazards" />
        <LayerControls sidebar layers={layers} onChange={changeLayers} />
        <SelectionPanel selection={liveSelection} onClose={() => { setSelection(null); setFollowKey(null); }} />
        {followControls}
      </SidePanel>
      </div>

      {/* Mobile: selection sheet */}
      {selection && panelOpen && (
        <div className="lg:hidden absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-y-auto border-t border-[var(--color-border-mid)] bg-[var(--color-bg-panel)]">
          <SelectionPanel selection={liveSelection} onClose={() => { setSelection(null); setPanelOpen(false); setFollowKey(null); }} />
          {followControls}
        </div>
      )}
      {currentEnvironment && <EnvironmentDialog {...currentEnvironment} onClose={() => setEnvironmentSelection(null)} />}
    </div>
  );
}

// ── Small UI bits ──

// Solid, no backdrop blur: blurring the live map behind each panel on every frame cost weak GPUs about a third of their frame rate
const HUD_BG = "rgba(13,24,30,0.94)";

function Hud({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-xs px-3 py-2 rounded border border-[var(--color-border-mid)] flex flex-col gap-1.5"
      style={{ background: HUD_BG }}>
      {children}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--color-text-dim)] tracking-[0.08em] w-16">{label}</span>
      {children}
      <span className="text-[var(--color-cyan)] tabular-nums">{value}</span>
    </div>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className="tabular-nums text-[var(--color-text)]">{value}</span>
    </span>
  );
}

function TransitFollowControls({ vehicle, following, onToggle }: { vehicle: TransitVehicle | null; following: boolean; onToggle: () => void }) {
  const now = useNow(1000);
  const age = vehicle ? Math.max(0, Math.floor(now / 1000 - vehicle.timestamp)) : null;
  const fresh = age !== null && age < 180;
  return <div className="px-3 pb-3 space-y-2 text-xs">
    <PillButton active={following} disabled={!following && !fresh} onClick={onToggle}>{following ? "STOP FOLLOWING" : "FOLLOW"}</PillButton>
    <p className="text-[var(--color-text-muted)]">{age !== null ? `Updated ${age} seconds ago · checks every 30 seconds` : "Vehicle has no recent report."}</p>
    {!fresh && <p>Following is unavailable until a new position arrives.</p>}
    {following && <p role="status">{fresh ? "Dashed line = estimated path, not a recorded route. Smooth view may lag one report." : "Following paused · no recent position"}</p>}
  </div>;
}

function SelectionPanel({ selection, onClose }: { selection: Selection | null; onClose: () => void }) {
  if (!selection) {
    return (
      <div className="p-3 border-b border-[var(--color-border)] text-xs text-[var(--color-text-dim)]">
        Click an aircraft, bus, camera, news pin or quake for details. Drag with right mouse / two fingers to tilt.
      </div>
    );
  }
  return (
    <div className="p-3 border-b border-[var(--color-border)] font-mono text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="tracking-[0.08em] text-[var(--color-cyan)]">{selection.kind.toUpperCase()}</span>
        <button onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] min-w-[44px] min-h-11 text-right" aria-label="Close">✕</button>
      </div>
      {selection.kind === "flight" && <FlightDetail f={selection.data} />}
      {selection.kind === "transit" && (
        <KV rows={[["VEHICLE", selection.data.label], ["ROUTE", selection.data.routeId || "—"], ["FEED", selection.data.feed], ["SPEED", selection.data.type === "train" ? "Not verified" : `${Math.round(selection.data.speed)} km/h`]]} />
      )}
      {selection.kind === "cctv" && <CctvDetail c={selection.data} />}
      {selection.kind === "quake" && (
        <KV rows={[["MAG", `M${selection.data.magnitude.toFixed(1)} ${selection.data.magnitudeType}`], ["DEPTH", `${selection.data.depth} km`], ["WHERE", selection.data.location], ["WHEN", new Date(selection.data.utcDatetime).toLocaleString("en-MY")], ["STATUS", selection.data.status]]} />
      )}
      {selection.kind === "pop" && <KV rows={[["POPULATION", selection.data.pop.toLocaleString()], ["CELL", "H3 hexagon, ~250 km²"]]} />}
      {selection.kind === "news" && (
        <div className="flex flex-col gap-2">
          <div className="text-[var(--color-text)]">{selection.data.name}</div>
          {selection.data.headlines.map((h) => (
            <a key={h.link} href={h.link} target="_blank" rel="noopener noreferrer" className="block text-[var(--color-text-muted)] hover:text-[var(--color-cyan)] leading-snug">
              <span className="text-[var(--color-text-dim)]">{h.source} · </span>{h.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <span className="text-[var(--color-text-dim)] tracking-[0.06em]">{k}</span>
          <span className="text-[var(--color-text)] break-words">{v}</span>
        </div>
      ))}
    </div>
  );
}

function FlightDetail({ f }: { f: Flight }) {
  const [route, setRoute] = useState<FlightRoute | null | undefined>(undefined);
  useEffect(() => {
    setRoute(undefined);
    if (!f.callsign) { setRoute(null); return; }
    // Ignore a late answer for a previously selected aircraft
    let stale = false;
    fetch(`/api/live/flight-route?callsign=${encodeURIComponent(f.callsign)}`)
      .then((r) => (r.ok ? r.json() : null)).then((r) => { if (!stale) setRoute(r); }).catch(() => { if (!stale) setRoute(null); });
    return () => { stale = true; };
  }, [f.callsign]);
  const leg = route?.origin && route?.destination ? `${route.origin.iata} ${route.origin.city} → ${route.destination.iata} ${route.destination.city}` : route === undefined ? "…" : "unknown";
  return (
    <KV rows={[
      ["CALLSIGN", f.callsign || f.icao24],
      ["FLIGHT", route?.iata ?? f.flightNum ?? "—"],
      ["AIRLINE", route?.airline ?? f.airline ?? (f.military ? "MILITARY" : "—")],
      ["ROUTE", leg],
      ["ALT", `${f.altitude.toLocaleString()} m`],
      ["SPEED", `${f.velocity} km/h`],
      ["V/S", `${f.verticalRate > 0 ? "▲" : f.verticalRate < 0 ? "▼" : "—"} ${Math.abs(f.verticalRate)} m/min`],
      ["HEX", f.icao24],
    ]} />
  );
}

function CctvDetail({ c }: { c: CctvPin }) {
  // Proxy fetches a fresh signed still each time; `tick` re-requests every 30 s
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    setErr(false); setLoaded(false);
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [c]);
  const src = `/api/cctv/image?h=${c.highway}&name=${encodeURIComponent(c.name)}&t=${tick}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[var(--color-text)]">{c.name}{c.approx && <span className="text-[var(--color-text-dim)]"> · approx. position</span>}</div>
      <button onClick={() => setFull(true)} className="cursor-zoom-in text-left" aria-label="View full size">
        {/* LLM's server takes several seconds; show a placeholder until the first still lands.
            The <img> stays mounted on error so the 30 s URL change actually retries. */}
        {(err || !loaded) && (
          <div className="w-full aspect-[4/3] rounded border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-dim)]">
            {err ? "IMAGE UNAVAILABLE · retrying" : "LOADING STILL…"}
          </div>
        )}
        <img src={src} alt={c.name} onError={() => { setErr(true); setLoaded(false); }} onLoad={() => { setErr(false); setLoaded(true); }} className={`w-full rounded border border-[var(--color-border)] ${loaded && !err ? "" : "hidden"}`} />
        <div className="text-[11px] text-[var(--color-text-dim)] mt-1 tracking-[0.06em]">LIVE STILL · refreshes every 30s · click to enlarge</div>
      </button>
      {full && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 cursor-zoom-out" style={{ background: "rgba(7,16,21,0.92)" }} onClick={() => setFull(false)} role="dialog" aria-label={c.name}>
          {/* Source stills are 320×240; upscale to fill the viewport */}
          <img src={src} alt={c.name} style={{ width: "min(92vw, 133vh)" }} className="max-h-full rounded border border-[var(--color-border-bright)]" />
          <div className="absolute top-4 left-4 font-mono text-xs text-[var(--color-cyan)] tracking-[0.08em]">{c.name} · CLICK TO CLOSE</div>
        </div>
      )}
    </div>
  );
}

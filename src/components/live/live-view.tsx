"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useFlights, type Flight } from "@/lib/hooks/use-flights";
import { useTransit } from "@/lib/hooks/use-transit";
import { reportFeedStatus } from "@/lib/feed-status";
import type { EarthquakeEntry, WeatherData } from "@/lib/data/weather-types";
import type { RssItem } from "@/app/api/rss/route";
import type { FlightRoute } from "@/app/api/live/flight-route/route";
import { matchTown } from "@/lib/live/towns";
import { currentHourIndex, type LiveGrid } from "@/lib/live/grid-field";
import { RAINVIEWER_FRAMES, type RainViewerIndex, type RadarFrame } from "@/lib/live/tiles";
import cctvCoords from "@/lib/data/cctv-coords.json";
import type { LayerKey, Basemap, Selection, NewsPin, CctvPin } from "./live-map";
import { scrollHorizontallyOnWheel } from "@/lib/ui/horizontal-scroll";
import PillButton from "@/components/ui/pill-button";

const LiveMap = dynamic(() => import("./live-map"), { ssr: false });

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  radar: true, smog: true, cloud: false, wind: false, night: false, haze: false, terminator: true,
  flights: true, transit: true, rail: true, cctv: true, news: true, quakes: true, pop: false, buildings: true, terrain: false,
};

const LAYER_GROUPS: { title: string; items: { key: LayerKey; label: string; hint: string }[] }[] = [
  {
    title: "SKY",
    items: [
      { key: "radar", label: "RAIN RADAR", hint: "RainViewer, last 2h" },
      { key: "cloud", label: "CLOUDS", hint: "Open-Meteo forecast" },
      { key: "wind", label: "WIND", hint: "Open-Meteo forecast" },
      { key: "smog", label: "SMOG PM2.5", hint: "Open-Meteo CAMS" },
      { key: "haze", label: "HAZE (SAT)", hint: "NASA MODIS aerosol, daily" },
      { key: "terminator", label: "DAY / NIGHT", hint: "Solar terminator" },
    ],
  },
  {
    title: "GROUND",
    items: [
      { key: "flights", label: "AIRCRAFT", hint: "adsb.lol + OpenSky, 60s" },
      { key: "transit", label: "BUS & TRAIN", hint: "data.gov.my GTFS-RT, 30s" },
      { key: "rail", label: "RAIL LINES", hint: "OpenStreetMap, detailed" },
      { key: "cctv", label: "HIGHWAY CCTV", hint: "LLM.gov.my" },
      { key: "news", label: "NEWS PINS", hint: "RSS, town mentions" },
      { key: "quakes", label: "EARTHQUAKES", hint: "USGS + MET" },
    ],
  },
  {
    title: "SURFACE",
    items: [
      { key: "buildings", label: "3D BUILDINGS", hint: "zoom in to a city" },
      { key: "terrain", label: "3D TERRAIN", hint: "hills; slower to pan" },
      { key: "pop", label: "POPULATION", hint: "Kontur hexagons, 2023" },
      { key: "night", label: "NIGHT LIGHTS", hint: "NASA Black Marble" },
    ],
  },
];

export default function LiveView() {
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [grid, setGrid] = useState<LiveGrid | null>(null);
  const [hour, setHour] = useState(0);
  const [radar, setRadar] = useState<{ host: string; frames: RadarFrame[] } | null>(null);
  // Radar shows the newest frame and follows new frames as they arrive ("live").
  // Dragging the slider rewinds; LIVE snaps back.
  const [radarRewind, setRadarRewind] = useState<number | null>(null);
  const [quakes, setQuakes] = useState<EarthquakeEntry[]>([]);
  const [news, setNews] = useState<NewsPin[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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

  // Weather/air grid (3h server cache) — smog/cloud/wind always show the current hour;
  // grid re-fetched hourly (also retries a failed load), hour re-picked every 15 min
  useEffect(() => {
    const load = () =>
      fetch("/api/live/grid")
        .then((r) => { reportFeedStatus("grid", r.ok); return r.ok ? r.json() : null; })
        .then((g: LiveGrid | null) => { if (g) { setGrid(g); setHour(currentHourIndex(g)); } })
        .catch(() => reportFeedStatus("grid", false));
    load();
    const t = setInterval(load, 3_600_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!grid) return;
    const t = setInterval(() => setHour(currentHourIndex(grid)), 900_000);
    return () => clearInterval(t);
  }, [grid]);

  // Radar frame index from RainViewer, refreshed every 5 min
  useEffect(() => {
    const load = () =>
      fetch(RAINVIEWER_FRAMES)
        .then((r) => { reportFeedStatus("radar", r.ok); return r.ok ? r.json() : null; })
        .then((idx: RainViewerIndex | null) => {
          // nowcast can be missing or empty; keep the previous index rather than an empty one
          const frames = [...(idx?.radar?.past ?? []), ...(idx?.radar?.nowcast ?? [])];
          if (idx && frames.length) setRadar({ host: idx.host, frames });
        })
        .catch(() => reportFeedStatus("radar", false));
    load();
    const t = setInterval(load, 300_000);
    return () => clearInterval(t);
  }, []);

  const radarLast = Math.max(0, (radar?.frames.length ?? 1) - 1);
  const radarIndex = radarRewind === null ? radarLast : Math.min(radarRewind, radarLast);

  // Earthquakes come with the existing weather payload; refreshed every 10 min
  useEffect(() => {
    const load = () =>
      fetch("/api/weather")
        .then((r) => (r.ok ? r.json() : null))
        .then((w: WeatherData | null) => { if (w?.earthquakes) setQuakes(w.earthquakes); })
        .catch(() => {});
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

  const toggle = useCallback((k: LayerKey) => setLayers((l) => ({ ...l, [k]: !l[k] })), []);
  const onSelect = useCallback((s: Selection | null) => { setSelection(s); if (s) setPanelOpen(true); }, []);

  const radarLabel = radar ? new Date(radar.frames[radarIndex].time * 1000).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--";

  return (
    <div className="flex-1 min-h-0 relative flex flex-col lg:flex-row">
      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <LiveMap
          layers={layers} basemap={basemap} hour={hour} grid={grid} radar={radar} radarIndex={radarIndex}
          flights={flights} transit={transit} quakes={quakes} news={news} cctv={cctv} selection={selection} onSelect={onSelect}
        />

        {/* Top-left: basemap + time controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-1.5rem)]">
          <div className="flex gap-1 p-1 rounded w-max" style={{ background: "rgba(13,24,30,0.9)", backdropFilter: "blur(8px)" }}>
            <PillButton active={basemap === "dark"} onClick={() => setBasemap("dark")}>DARK</PillButton>
            <PillButton active={basemap === "satellite"} onClick={() => setBasemap("satellite")}>SATELLITE</PillButton>
          </div>
          <Hud>
            <Row label="RADAR" value={radarRewind === null ? `${radarLabel} LIVE` : radarLabel}>
              <input type="range" min={0} max={radarLast} value={radarIndex}
                onChange={(e) => setRadarRewind(+e.target.value === radarLast ? null : +e.target.value)} className="w-24 md:w-32 accent-[var(--color-cyan)]" aria-label="Radar frame" />
              {radarRewind !== null && (
                <button onClick={() => setRadarRewind(null)} className="text-[var(--color-amber)] hover:text-[var(--color-text-bright)] tracking-[0.08em]" aria-label="Back to live radar">LIVE</button>
              )}
            </Row>
          </Hud>
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

        {/* Mobile: layer strip */}
        <div className="lg:hidden absolute bottom-16 left-0 right-0 z-10 px-3">
          <div className="flex gap-1 overflow-x-auto scrollbar-none touch-pan-x" onWheel={scrollHorizontallyOnWheel}>
            {LAYER_GROUPS.flatMap((g) => g.items).map((it) => (
              <PillButton key={it.key} active={layers[it.key]} onClick={() => toggle(it.key)}>{it.label}</PillButton>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop sidebar: layers + selection */}
      <aside className={`hidden lg:flex flex-col w-72 shrink-0 border-l border-[var(--color-border-mid)] bg-[var(--color-bg-panel)] overflow-y-auto`}>
        <SelectionPanel selection={selection} onClose={() => setSelection(null)} />
        <div className="p-3 flex flex-col gap-4">
          {LAYER_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-xs tracking-[0.1em] text-[var(--color-text-dim)] mb-1.5">{g.title}</div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <label key={it.key} className="flex items-center gap-2 py-1 cursor-pointer text-xs hover:bg-[var(--color-bg-card)] px-1 -mx-1 rounded">
                    <input type="checkbox" checked={layers[it.key]} onChange={() => toggle(it.key)} className="accent-[var(--color-cyan)]" />
                    <span className={layers[it.key] ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>{it.label}</span>
                    <span className="ml-auto text-[var(--color-text-dim)] text-[10px] truncate max-w-[45%]">{it.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Mobile: selection sheet */}
      {selection && panelOpen && (
        <div className="lg:hidden absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-y-auto border-t border-[var(--color-border-mid)] bg-[var(--color-bg-panel)]">
          <SelectionPanel selection={selection} onClose={() => { setSelection(null); setPanelOpen(false); }} />
        </div>
      )}
    </div>
  );
}

// ── Small UI bits ──

function Hud({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-xs px-3 py-2 rounded border border-[var(--color-border-mid)] flex flex-col gap-1.5"
      style={{ background: "rgba(13,24,30,0.9)", backdropFilter: "blur(8px)" }}>
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
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-[var(--color-text-dim)]">{label}</span>
      <span className="tabular-nums text-[var(--color-text)]">{value}</span>
    </span>
  );
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
        <span className="tracking-[0.1em] text-[var(--color-cyan)]">{selection.kind.toUpperCase()}</span>
        <button onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] min-w-[44px] min-h-[24px] text-right" aria-label="Close">✕</button>
      </div>
      {selection.kind === "flight" && <FlightDetail f={selection.data} />}
      {selection.kind === "transit" && (
        <KV rows={[["VEHICLE", selection.data.label], ["ROUTE", selection.data.routeId || "—"], ["FEED", selection.data.feed], ["SPEED", `${Math.round(selection.data.speed)} km/h`]]} />
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
        <div className="text-[10px] text-[var(--color-text-dim)] mt-1 tracking-[0.06em]">LIVE STILL · refreshes every 30s · click to enlarge</div>
      </button>
      {full && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 cursor-zoom-out" style={{ background: "rgba(7,16,21,0.92)" }} onClick={() => setFull(false)} role="dialog" aria-label={c.name}>
          {/* Source stills are 320×240; upscale to fill the viewport */}
          <img src={src} alt={c.name} style={{ width: "min(92vw, 133vh)" }} className="max-h-full rounded border border-[var(--color-border-bright)]" />
          <div className="absolute top-4 left-4 font-mono text-xs text-[var(--color-cyan)] tracking-[0.1em]">{c.name} · CLICK TO CLOSE</div>
        </div>
      )}
    </div>
  );
}

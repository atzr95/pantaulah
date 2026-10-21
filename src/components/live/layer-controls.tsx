"use client";

import { useState } from "react";
import type { LayerKey } from "./live-map";
import ItemDialog from "@/components/ui/item-dialog";
import PillButton from "@/components/ui/pill-button";

type Layers = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: Layers = {
  radar: true, smog: true, cloud: false, wind: false, night: false, haze: false, terminator: true,
  flights: true, transit: true, rail: true, cctv: true, news: true, quakes: true, pop: false, buildings: true, terrain: false,
  rivers: false, shelters: false, fires: false, treeLoss: false,
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
      { key: "rivers", label: "RIVERS", hint: "JPS, recent readings" },
      { key: "shelters", label: "SHELTERS", hint: "JKM, open centres" },
      { key: "fires", label: "FIRE DETECTIONS", hint: "NASA, past 7 days" },
    ],
  },
  {
    title: "SURFACE",
    items: [
      { key: "buildings", label: "3D BUILDINGS", hint: "zoom in to a city" },
      { key: "terrain", label: "3D TERRAIN", hint: "hills; slower to pan" },
      { key: "pop", label: "POPULATION", hint: "Kontur hexagons, 2023" },
      { key: "night", label: "NIGHT LIGHTS", hint: "NASA Black Marble" },
      { key: "treeLoss", label: "TREE LOSS", hint: "UMD, 2001–2025" },
    ],
  },
];

const QUICK_VIEWS: { label: string; keys: LayerKey[] }[] = [
  { label: "WEATHER", keys: ["radar", "cloud", "wind", "smog", "terminator"] },
  { label: "TRAVEL", keys: ["flights", "transit", "rail", "cctv", "buildings"] },
  { label: "ENVIRONMENT", keys: ["rivers", "shelters", "fires", "smog", "wind", "quakes"] },
];
const LAYER_KEYS = LAYER_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export default function LayerControls({ layers, onChange, sidebar = false }: {
  layers: Layers;
  onChange: (layers: Layers) => void;
  sidebar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = LAYER_KEYS.filter((key) => layers[key]).length;
  const choose = (keys: LayerKey[]) => {
    const next = { ...DEFAULT_LAYERS };
    for (const key of LAYER_KEYS) next[key] = keys.includes(key);
    onChange(next);
  };
  const layerList = (
    <div className="flex flex-col gap-3 lg:gap-2 w-full">
      {LAYER_GROUPS.map((group) => (
        <fieldset key={group.title}>
          <legend className="text-xs tracking-[0.08em] text-[var(--color-text-dim)] mb-1.5 lg:mb-1">{group.title}</legend>
          {group.items.map((item) => (
            <label key={item.key} className="flex items-center gap-2 min-h-9 lg:min-h-6 py-1.5 lg:py-1 cursor-pointer text-xs hover:bg-[var(--color-bg-card)] rounded">
              <input type="checkbox" checked={layers[item.key]} onChange={() => onChange({ ...layers, [item.key]: !layers[item.key] })}
                className="accent-[var(--color-cyan)] shrink-0" />
              <span className={layers[item.key] ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>{item.label}</span>
              <span className="ml-auto text-right text-[var(--color-text-dim)] text-[11px] max-w-[45%]">{item.hint}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );

  return (
    <div className="shrink-0 border-b border-[var(--color-border-mid)] bg-[var(--color-bg-panel)] p-2 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Quick map views" className="flex flex-wrap gap-1">
        {QUICK_VIEWS.map((view) => (
          <PillButton key={view.label} className={sidebar ? "px-2" : ""} active={LAYER_KEYS.every((key) => layers[key] === view.keys.includes(key))}
            title={`Show only ${view.label.toLowerCase()} layers`} onClick={() => choose(view.keys)}>
            {view.label}
          </PillButton>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <PillButton onClick={() => choose([])}>CLEAR</PillButton>
        <PillButton onClick={() => onChange({ ...DEFAULT_LAYERS })}>RESET</PillButton>
        {sidebar
          ? <span role="status" className="self-center text-xs text-[var(--color-text-muted)] px-2">LAYERS ({count} ON)</span>
          : <PillButton active={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>LAYERS ({count} ON)</PillButton>}
      </div>
      {sidebar && layerList}
      {!sidebar && open && (
        <ItemDialog title={`MAP LAYERS · ${count} ON`} onClose={() => setOpen(false)}>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">Choose what appears on the map. Quick views replace this choice.</p>
          {layerList}
        </ItemDialog>
      )}
    </div>
  );
}

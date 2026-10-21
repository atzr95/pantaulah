"use client";

import { useMapData } from "./use-map-data";
import type {
  RiverStation,
  Shelter,
  FireDetection,
} from "@/lib/data/environment";

export function useEnvironment(layers: {
  rivers: boolean;
  shelters: boolean;
  fires: boolean;
}) {
  const rivers = useMapData<RiverStation[]>(
    layers.rivers ? "/api/live/environment?kind=rivers" : null,
    120_000,
  );
  const shelters = useMapData<Shelter[]>(
    layers.shelters ? "/api/live/environment?kind=shelters" : null,
  );
  const fires = useMapData<FireDetection[]>(
    layers.fires ? "/api/live/environment?kind=fires" : null,
    1_800_000,
  );
  return { rivers, shelters, fires };
}

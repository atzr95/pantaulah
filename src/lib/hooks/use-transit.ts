"use client";

import { useState, useEffect, useRef } from "react";
import { reportFeedStatus } from "@/lib/feed-status";

export interface TransitVehicle {
  id: string;
  label: string;
  routeId: string;
  lat: number;
  lon: number;
  bearing: number;
  speed: number; // km/h
  timestamp: number;
  feed: string;
  type: "train" | "bus";
}

const REFRESH_MS = 30_000; // 30 seconds
const STALE_MS = 3 * 60_000; // remove vehicles not seen for 3 minutes

export function useTransit(enabled: boolean) {
  const [vehicles, setVehicles] = useState<TransitVehicle[]>([]);
  const vehicleMap = useRef<Map<string, TransitVehicle & { lastSeen: number }>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setVehicles([]);
      vehicleMap.current.clear();
      return;
    }

    const controller = new AbortController();

    const fetchTransit = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/transit", { signal: controller.signal });
        reportFeedStatus("transit", res.ok);
        if (!res.ok) return;
        const data = await res.json();
        const now = Date.now();

        // Merge: update existing, add new
        for (const v of (data.vehicles || []) as TransitVehicle[]) {
          const key = `${v.feed}::${v.id}`;
          vehicleMap.current.set(key, { ...v, lastSeen: now });
        }

        // Prune stale vehicles (not seen in 3 minutes)
        for (const [key, v] of vehicleMap.current) {
          if (now - v.lastSeen > STALE_MS) vehicleMap.current.delete(key);
        }

        setVehicles(Array.from(vehicleMap.current.values()));
      } catch (err) {
        // keep existing data on failure
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          reportFeedStatus("transit", false);
        }
      }
    };

    fetchTransit();
    const interval = setInterval(fetchTransit, REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) fetchTransit();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.abort();
    };
  }, [enabled]);

  return vehicles;
}

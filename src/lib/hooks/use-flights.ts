"use client";

import { useState, useEffect } from "react";
import { reportFeedStatus } from "@/lib/feed-status";

export interface Flight {
  icao24: string;
  callsign: string;
  airline: string | null;
  flightNum: string | null;
  origin: string;
  lon: number;
  lat: number;
  altitude: number;
  geoAltitude: number;
  velocity: number;
  heading: number;
  verticalRate: number; // m/min, positive = climbing
  squawk: string | null;
}

const REFRESH_MS = 60_000; // 60 seconds

export function useFlights(enabled: boolean) {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    if (!enabled) {
      setFlights([]);
      return;
    }

    const controller = new AbortController();

    const fetchFlights = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/flights", { signal: controller.signal });
        reportFeedStatus("flights", res.ok);
        if (!res.ok) return;
        const data = await res.json();
        setFlights(data.flights || []);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          reportFeedStatus("flights", false);
        }
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) fetchFlights();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.abort();
    };
  }, [enabled]);

  return flights;
}

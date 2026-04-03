"use client";

import { useState, useEffect, useCallback } from "react";

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

  const fetchFlights = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/flights");
      if (!res.ok) return;
      const data = await res.json();
      setFlights(data.flights || []);
    } catch {
      // silently fail
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setFlights([]);
      return;
    }
    fetchFlights();
    const interval = setInterval(fetchFlights, REFRESH_MS);
    return () => clearInterval(interval);
  }, [enabled, fetchFlights]);

  return flights;
}

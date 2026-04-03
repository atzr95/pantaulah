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

const REFRESH_MS = 30_000; // 30 seconds

const OPENSKY_URL =
  "https://opensky-network.org/api/states/all?lamin=0&lamax=8&lomin=98&lomax=120";

const AIRLINES: Record<string, string> = {
  MAS: "Malaysia Airlines", MXD: "Malaysia Airlines", AXM: "AirAsia", XAX: "AirAsia X",
  MNA: "Batik Air Malaysia", ODB: "Batik Air Malaysia", FFM: "Firefly", MWG: "MASwings",
  SIA: "Singapore Airlines", SLK: "SilkAir/Scoot", TGW: "Scoot", THA: "Thai Airways",
  TGN: "Thai Smile", AIQ: "Thai AirAsia", CPA: "Cathay Pacific", HDA: "Cathay Pacific",
  CES: "China Eastern", CSN: "China Southern", CCA: "Air China", CAL: "China Airlines",
  EVA: "EVA Air", JSA: "Jetstar Asia", GAI: "Garuda Indonesia", LNI: "Lion Air",
  BTK: "Batik Air", SJY: "Sriwijaya Air", QTR: "Qatar Airways", ETD: "Etihad",
  UAE: "Emirates", KAL: "Korean Air", AAR: "Asiana", JAL: "Japan Airlines",
  ANA: "All Nippon", VJC: "VietJet", HVN: "Vietnam Airlines", CEB: "Cebu Pacific",
  PAL: "Philippine Airlines", RBA: "Royal Brunei", BAV: "Bamboo Airways",
  KLM: "KLM", BAW: "British Airways", DLH: "Lufthansa", AFR: "Air France",
  QFA: "Qantas", SWR: "Swiss", FIN: "Finnair", THY: "Turkish Airlines",
  FDX: "FedEx", UPS: "UPS", GTI: "Atlas Air", CLX: "Cargolux",
};

function decodeCallsign(callsign: string): { airline: string | null; flightNum: string | null } {
  if (!callsign || callsign.length < 4) return { airline: null, flightNum: null };
  const prefix = callsign.substring(0, 3);
  const airline = AIRLINES[prefix] || null;
  const flightNum = callsign.substring(3).replace(/^0+/, "");
  return { airline, flightNum };
}

function parseStates(states: unknown[][]): Flight[] {
  return states
    .filter(
      (s) => s[5] != null && s[6] != null && !s[8] // has lon, lat, and not on ground
    )
    .map((s) => {
      const callsign = ((s[1] as string) || "").trim();
      const { airline, flightNum } = decodeCallsign(callsign);
      return {
        icao24: s[0] as string,
        callsign,
        airline,
        flightNum,
        origin: s[2] as string,
        lon: s[5] as number,
        lat: s[6] as number,
        altitude: Math.round((s[7] as number) || 0),
        geoAltitude: Math.round((s[13] as number) || 0),
        velocity: Math.round(((s[9] as number) || 0) * 3.6),
        heading: s[10] as number,
        verticalRate: Math.round(((s[11] as number) || 0) * 60),
        squawk: s[14] as string | null,
      };
    });
}

export function useFlights(enabled: boolean) {
  const [flights, setFlights] = useState<Flight[]>([]);

  const fetchFlights = useCallback(async () => {
    if (!enabled) return;
    try {
      // Try direct client-side fetch first (works from user's residential IP)
      const res = await fetch(OPENSKY_URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`OpenSky ${res.status}`);
      const data = await res.json();
      setFlights(parseStates(data.states || []));
    } catch {
      // CORS blocked or network error — fall back to server proxy
      try {
        const res = await fetch("/api/flights");
        if (!res.ok) return;
        const data = await res.json();
        setFlights(data.flights || []);
      } catch {
        // both failed, keep existing flights
      }
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

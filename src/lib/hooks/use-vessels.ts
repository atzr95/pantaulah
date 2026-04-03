"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface Vessel {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  speed: number; // knots
  heading: number; // degrees
  shipType: number;
  lastUpdate: number; // timestamp ms
}

const STALE_MS = 5 * 60_000; // prune vessels not seen in 5 minutes
const FLUSH_MS = 5_000; // push state updates every 5 seconds
const MAX_VESSELS = 500;
const RECONNECT_MS = 5_000;

// Malaysia bounding box: lat 0.5-7.5, lon 99-120
const BOUNDING_BOX = [
  [0.5, 99],
  [7.5, 120],
] as const;

export function useVessels(enabled: boolean) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const accum = useRef<Map<number, Vessel>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  const flush = useCallback(() => {
    const now = Date.now();
    // Prune stale entries
    for (const [mmsi, v] of accum.current) {
      if (now - v.lastUpdate > STALE_MS) accum.current.delete(mmsi);
    }
    // Cap at MAX_VESSELS (keep most recent)
    if (accum.current.size > MAX_VESSELS) {
      const sorted = [...accum.current.entries()].sort(
        (a, b) => b[1].lastUpdate - a[1].lastUpdate,
      );
      accum.current = new Map(sorted.slice(0, MAX_VESSELS));
    }
    setVessels([...accum.current.values()]);
  }, []);

  const connect = useCallback(() => {
    const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY;
    if (!apiKey) return;

    try {
      const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            Apikey: apiKey,
            BoundingBoxes: [
              [
                [BOUNDING_BOX[0][0], BOUNDING_BOX[0][1]],
                [BOUNDING_BOX[1][0], BOUNDING_BOX[1][1]],
              ],
            ],
            FiltersShipMMSI: [],
            FilterMessageTypes: ["PositionReport"],
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.MessageType !== "PositionReport") return;
          const meta = msg.MetaData;
          const pos = msg.Message?.PositionReport;
          if (!meta || !pos) return;

          const mmsi = meta.MMSI;
          if (!mmsi) return;

          accum.current.set(mmsi, {
            mmsi,
            name: (meta.ShipName || "").trim(),
            lat: pos.Latitude,
            lon: pos.Longitude,
            speed: pos.Sog ?? 0,
            heading: pos.TrueHeading ?? pos.Cog ?? 0,
            shipType: meta.ShipType ?? 0,
            lastUpdate: Date.now(),
          });
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Auto-reconnect
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket constructor failed
      reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Cleanup
      wsRef.current?.close();
      wsRef.current = null;
      clearTimeout(reconnectTimer.current);
      clearInterval(flushTimer.current);
      accum.current.clear();
      setVessels([]);
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY;
    if (!apiKey) return;

    connect();
    flushTimer.current = setInterval(flush, FLUSH_MS);

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      clearTimeout(reconnectTimer.current);
      clearInterval(flushTimer.current);
      accum.current.clear();
    };
  }, [enabled, connect, flush]);

  return vessels;
}

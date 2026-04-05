import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

interface TransitVehicle {
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

const FEEDS: { url: string; feed: string; type: "train" | "bus" }[] = [
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb", feed: "KTM", type: "train" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl", feed: "Rapid KL", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder", feed: "MRT Feeder", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-penang", feed: "Rapid Penang", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kuantan", feed: "Rapid Kuantan", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-johor", feed: "MyBAS Johor", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-melaka", feed: "MyBAS Melaka", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuching", feed: "MyBAS Kuching", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-ipoh", feed: "MyBAS Ipoh", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-seremban-a", feed: "MyBAS Seremban", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kota-bharu", feed: "MyBAS K.Bharu", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuala-terengganu", feed: "MyBAS K.T'ganu", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-alor-setar", feed: "MyBAS A.Setar", type: "bus" },
  { url: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kangar", feed: "MyBAS Kangar", type: "bus" },
];

async function fetchFeed(
  feedConfig: (typeof FEEDS)[number]
): Promise<TransitVehicle[]> {
  try {
    const res = await fetch(feedConfig.url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];

    const buf = await res.arrayBuffer();
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buf)
    );

    return message.entity
      .filter((e) => e.vehicle?.position?.latitude != null)
      .map((e) => {
        const v = e.vehicle!;
        const pos = v.position!;
        return {
          id: v.vehicle?.id || e.id,
          label: v.vehicle?.label || v.vehicle?.licensePlate || v.vehicle?.id || e.id,
          routeId: v.trip?.routeId || "",
          lat: pos.latitude,
          lon: pos.longitude,
          bearing: pos.bearing || 0,
          speed: Math.round(pos.speed || 0), // already km/h from data.gov.my
          timestamp: Number(v.timestamp || 0),
          feed: feedConfig.feed,
          type: feedConfig.type,
        };
      });
  } catch {
    return [];
  }
}

export async function GET() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const vehicles = results.flat();

  return new NextResponse(JSON.stringify({ vehicles, time: Date.now() }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
    },
  });
}

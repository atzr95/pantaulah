import { NextResponse } from "next/server";
import { cachedJson } from "@/lib/server/edge-cache";

/** Callsign → origin/destination/airline via adsbdb.com (free, no key). Cached 24h. */

export interface FlightRoute {
  airline: string | null;
  iata: string | null; // e.g. MH370
  origin: { iata: string; name: string; city: string } | null;
  destination: { iata: string; name: string; city: string } | null;
}

interface AdsbdbAirport { iata_code: string; name: string; municipality: string }

export async function GET(request: Request) {
  const callsign = new URL(request.url).searchParams.get("callsign")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{3,8}$/.test(callsign)) {
    return NextResponse.json({ error: "bad callsign" }, { status: 400 });
  }
  try {
    const route = await cachedJson<FlightRoute | null>(`live:route:${callsign}`, 86_400, async () => {
      const res = await fetch(`https://api.adsbdb.com/v0/callsign/${callsign}`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`adsbdb ${res.status}`);
      const fr = (await res.json())?.response?.flightroute;
      if (!fr) return null;
      const ap = (a: AdsbdbAirport | undefined) =>
        a ? { iata: a.iata_code, name: a.name, city: a.municipality } : null;
      return {
        airline: fr.airline?.name ?? null,
        iata: fr.callsign_iata ?? null,
        origin: ap(fr.origin),
        destination: ap(fr.destination),
      };
    });
    return NextResponse.json(route, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json(null, { status: 200 });
  }
}

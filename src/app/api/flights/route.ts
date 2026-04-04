import { NextResponse } from "next/server";


/** ICAO airline code → name lookup for common airlines in Malaysia airspace */
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

// Multiple centre points to cover all of Malaysia (250 NM max per request)
const ADSB_LOL_URLS = [
  "https://api.adsb.lol/v2/lat/3.14/lon/101.69/dist/250", // Peninsular (KL)
  "https://api.adsb.lol/v2/lat/6.0/lon/102.0/dist/250",   // North Peninsular
  "https://api.adsb.lol/v2/lat/2.5/lon/111.5/dist/250",    // Sarawak
  "https://api.adsb.lol/v2/lat/5.5/lon/116.0/dist/250",    // Sabah
];

// OpenSky as fallback — works from residential IPs (localhost) but not cloud
const OPENSKY_URL =
  "https://opensky-network.org/api/states/all?lamin=0&lamax=8&lomin=98&lomax=120";

interface AcState {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
}

interface Flight {
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
  verticalRate: number;
  squawk: string | null;
}

function parseAdsbLol(ac: AcState[]): Flight[] {
  return ac
    .filter(
      (a) =>
        a.lat != null &&
        a.lon != null &&
        a.alt_baro !== "ground" &&
        typeof a.alt_baro === "number"
    )
    .map((a) => {
      const callsign = (a.flight || "").trim();
      const { airline, flightNum } = decodeCallsign(callsign);
      return {
        icao24: a.hex || "",
        callsign,
        airline,
        flightNum,
        origin: "",
        lon: a.lon as number,
        lat: a.lat as number,
        altitude: Math.round((a.alt_baro as number) * 0.3048),
        geoAltitude: Math.round((a.alt_geom || 0) * 0.3048),
        velocity: Math.round((a.gs || 0) * 1.852),
        heading: a.track || 0,
        verticalRate: Math.round((a.baro_rate || 0) * 0.3048),
        squawk: a.squawk || null,
      };
    });
}

function parseOpenSky(states: unknown[][]): Flight[] {
  return states
    .filter((s) => s[5] != null && s[6] != null && !s[8])
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

/** Try OpenSky first (better coverage), fall back to adsb.lol */
export async function GET() {
  // Try OpenSky first — works from residential IPs (localhost)
  try {
    const res = await fetch(OPENSKY_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);

    const data = await res.json();
    const flights = parseOpenSky(data.states || []);
    if (flights.length > 0) {
      const body = JSON.stringify({ flights, time: data.time });
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
        },
      });
    }
  } catch {
    // fall through to adsb.lol
  }

  // Fallback: adsb.lol — fetch multiple regions in parallel (works from cloud IPs)
  try {
    const responses = await Promise.all(
      ADSB_LOL_URLS.map((url) =>
        fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: "application/json" },
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    );

    const allAc: AcState[] = [];
    for (const data of responses) {
      if (data?.ac) allAc.push(...data.ac);
    }

    // Deduplicate by icao24 hex code
    const seen = new Set<string>();
    const unique = allAc.filter((a) => {
      const key = a.hex || "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const flights = parseAdsbLol(unique);
    const body = JSON.stringify({ flights, time: Date.now() });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ flights: [] }, { status: 200 });
  }
}

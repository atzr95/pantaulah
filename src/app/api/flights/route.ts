import { NextResponse } from "next/server";

export const runtime = "edge";

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

// ── OAuth2 token cache ──────────────────────────────────
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Reuse token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedToken;
  } catch {
    return cachedToken; // return stale token if refresh fails
  }
}

// ── Response cache (serves stale data during rate-limit windows) ─
interface FlightCache {
  body: string;
  time: number;
}
let lastGoodResponse: FlightCache | null = null;
const CACHE_MAX_AGE_MS = 60_000; // serve cached response for up to 60s

/** Proxy OpenSky Network API for Malaysia airspace */
export async function GET() {
  // Return cached response if fresh enough
  if (lastGoodResponse && Date.now() - lastGoodResponse.time < CACHE_MAX_AGE_MS) {
    return new NextResponse(lastGoodResponse.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
      },
    });
  }

  try {
    // Malaysia bounding box (wide): lat 0-8, lon 98-120
    const url =
      "https://opensky-network.org/api/states/all?lamin=0&lamax=8&lomin=98&lomax=120";

    const headers: Record<string, string> = { Accept: "application/json" };
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      // Rate-limited or error — return last good response if available
      if (lastGoodResponse) {
        return new NextResponse(lastGoodResponse.body, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
          },
        });
      }
      return NextResponse.json(
        { flights: [], _debug: { error: "opensky_http", status: res.status, body: errorBody.slice(0, 500) } },
        { status: 200 },
      );
    }

    const data = await res.json();
    const states = data.states || [];

    const flights = states
      .filter(
        (s: unknown[]) =>
          s[5] != null && s[6] != null && !s[8] // has lon, lat, and not on ground
      )
      .map((s: unknown[]) => {
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
          velocity: Math.round(((s[9] as number) || 0) * 3.6), // m/s to km/h
          heading: s[10] as number,
          verticalRate: Math.round(((s[11] as number) || 0) * 60), // m/s to m/min
          squawk: s[14] as string | null,
        };
      });

    const body = JSON.stringify({ flights, time: data.time });

    // Cache this successful response
    lastGoodResponse = { body, time: Date.now() };

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    // Network error — return last good response if available
    if (lastGoodResponse) {
      return new NextResponse(lastGoodResponse.body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
        },
      });
    }
    return NextResponse.json(
      { flights: [], _debug: { error: "network", message: String(err) } },
      { status: 200 },
    );
  }
}

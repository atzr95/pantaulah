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

// KL centre, 250 NM radius covers Peninsular Malaysia + surrounding airspace
const ADSB_LOL_URL = "https://api.adsb.lol/v2/lat/3.14/lon/101.69/dist/250";

/** Proxy adsb.lol API for Malaysia airspace */
export async function GET() {
  try {
    const res = await fetch(ADSB_LOL_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ flights: [] }, { status: 200 });
    }

    const data = await res.json();
    const ac = data.ac || [];

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

    const flights = ac
      .filter(
        (a: AcState) =>
          a.lat != null &&
          a.lon != null &&
          a.alt_baro !== "ground" &&
          typeof a.alt_baro === "number"
      )
      .map((a: AcState) => {
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
          altitude: Math.round(a.alt_baro as number * 0.3048), // ft → m
          geoAltitude: Math.round((a.alt_geom || 0) * 0.3048),
          velocity: Math.round((a.gs || 0) * 1.852), // knots → km/h
          heading: a.track || 0,
          verticalRate: Math.round((a.baro_rate || 0) * 0.3048), // ft/min → m/min
          squawk: a.squawk || null,
        };
      });

    const body = JSON.stringify({ flights, time: data.now });

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

import { NextResponse } from "next/server";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";

/**
 * Fetches hospital bed & ICU utilization from KKMNow (data.gov.my).
 * Source: daily Parquet snapshot with 17 rows (16 states + Malaysia national).
 *
 * Fields: state, beds_nonicu, util_nonicu, beds_icu, util_icu, vent, util_vent
 */

const PARQUET_URL =
  "https://storage.data.gov.my/dashboards/bedutil_choropleth_state.parquet";

/** Map data.gov.my state names → topoName used in the app */
const STATE_MAP: Record<string, string> = {
  Johor: "Johor",
  Kedah: "Kedah",
  Kelantan: "Kelantan",
  Melaka: "Melaka",
  "Negeri Sembilan": "Negeri Sembilan",
  Pahang: "Pahang",
  Perak: "Perak",
  Perlis: "Perlis",
  "Pulau Pinang": "Penang",
  Sabah: "Sabah",
  Sarawak: "Sarawak",
  Selangor: "Selangor",
  Terengganu: "Terengganu",
  "W.P. Kuala Lumpur": "Kuala Lumpur",
  "W.P. Putrajaya": "Putrajaya",
  "W.P. Labuan": "Labuan",
};

interface BedUtilRow {
  state: string;
  beds_nonicu: number | bigint;
  util_nonicu: number;
  beds_icu: number | bigint;
  util_icu: number;
  vent: number | bigint;
  util_vent: number;
}

export interface BedUtilizationResponse {
  states: Record<
    string,
    {
      bedUtil: number;
      icuUtil: number;
      beds: number;
      icuBeds: number;
    }
  >;
  national: {
    bedUtil: number;
    icuUtil: number;
    beds: number;
    icuBeds: number;
  } | null;
  fetchedAt: string;
}

export async function GET() {
  try {
    const res = await fetch(PARQUET_URL, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch bed utilization data" },
        { status: 502 }
      );
    }

    const buf = await res.arrayBuffer();
    const rows: BedUtilRow[] = [];

    await parquetRead({
      file: buf,
      compressors,
      rowFormat: "object",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onComplete: (data: any[]) => rows.push(...(data as BedUtilRow[])),
    });

    const states: BedUtilizationResponse["states"] = {};
    let national: BedUtilizationResponse["national"] = null;

    for (const row of rows) {
      const entry = {
        bedUtil: Math.round(row.util_nonicu * 10) / 10,
        icuUtil: Math.round(row.util_icu * 10) / 10,
        beds: Number(row.beds_nonicu),
        icuBeds: Number(row.beds_icu),
      };

      if (row.state === "Malaysia") {
        national = entry;
      } else {
        const topoName = STATE_MAP[row.state];
        if (topoName) {
          states[topoName] = entry;
        }
      }
    }

    const data: BedUtilizationResponse = {
      states,
      national,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("Bed utilization fetch error:", err);
    return NextResponse.json(
      { error: "Internal error fetching bed utilization" },
      { status: 500 }
    );
  }
}

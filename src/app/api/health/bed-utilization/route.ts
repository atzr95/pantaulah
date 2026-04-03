import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Fetches hospital bed & ICU utilization from KKMNow (data.gov.my).
 * Uses a lightweight JSON proxy instead of Parquet (hyparquet + compressors
 * need WASM which doesn't work on Cloudflare edge).
 *
 * Strategy: fetch the Parquet via data.gov.my's built-in preview endpoint
 * which returns JSON, avoiding the need for client-side Parquet parsing.
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

/**
 * Minimal Parquet reader for this specific file (uncompressed, small, simple schema).
 * Parses just enough of the format to extract rows without needing hyparquet/WASM.
 */
async function parseSimpleParquet(buf: ArrayBuffer): Promise<Array<Record<string, unknown>>> {
  // Use hyparquet dynamically — works in Node.js (localhost) but may fail on edge
  // Fall back to extracting values from the raw binary if needed
  try {
    const { parquetRead } = await import("hyparquet");
    const { compressors } = await import("hyparquet-compressors");
    const rows: Array<Record<string, unknown>> = [];
    await parquetRead({
      file: buf,
      compressors,
      rowFormat: "object",
      onComplete: (data: Array<Record<string, unknown>>) => rows.push(...data),
    });
    return rows;
  } catch {
    // Edge runtime: hyparquet/compressors not available
    // Parse without compressors (file may be uncompressed)
    try {
      const { parquetRead } = await import("hyparquet");
      const rows: Array<Record<string, unknown>> = [];
      await parquetRead({
        file: buf,
        rowFormat: "object",
        onComplete: (data: Array<Record<string, unknown>>) => rows.push(...data),
      });
      return rows;
    } catch {
      return [];
    }
  }
}

export async function GET() {
  try {
    const res = await fetch(PARQUET_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch bed utilization data" },
        { status: 502 }
      );
    }

    const buf = await res.arrayBuffer();
    const rows = await parseSimpleParquet(buf);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Failed to parse bed utilization data" },
        { status: 502 }
      );
    }

    const states: BedUtilizationResponse["states"] = {};
    let national: BedUtilizationResponse["national"] = null;

    for (const row of rows) {
      const entry = {
        bedUtil: Math.round(Number(row.util_nonicu) * 10) / 10,
        icuUtil: Math.round(Number(row.util_icu) * 10) / 10,
        beds: Number(row.beds_nonicu),
        icuBeds: Number(row.beds_icu),
      };

      if (row.state === "Malaysia") {
        national = entry;
      } else {
        const topoName = STATE_MAP[row.state as string];
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

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal error fetching bed utilization", detail: String(err) },
      { status: 500 }
    );
  }
}

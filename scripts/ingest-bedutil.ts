/**
 * Fetches hospital bed & ICU utilization from KKMNow Parquet file
 * and saves as cached JSON for the API route to serve.
 *
 * Run: npx tsx scripts/ingest-bedutil.ts
 *
 * This exists because hyparquet + Brotli compressors need WASM which
 * doesn't work on Cloudflare's edge runtime. So we parse at build time.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";

const PARQUET_URL =
  "https://storage.data.gov.my/dashboards/bedutil_choropleth_state.parquet";

const CACHE_DIR = join(process.cwd(), "src", "lib", "data", "cache");

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
}

async function main() {
  console.log("Fetching bed utilization data...");
  const res = await fetch(PARQUET_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

  const buf = await res.arrayBuffer();
  const rows: BedUtilRow[] = [];

  await parquetRead({
    file: buf,
    compressors,
    rowFormat: "object",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onComplete: (data: any[]) => rows.push(...(data as BedUtilRow[])),
  });

  console.log(`Parsed ${rows.length} rows`);

  const states: Record<string, { bedUtil: number; icuUtil: number; beds: number; icuBeds: number }> = {};
  let national: { bedUtil: number; icuUtil: number; beds: number; icuBeds: number } | null = null;

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
      if (topoName) states[topoName] = entry;
    }
  }

  const output = { states, national, fetchedAt: new Date().toISOString() };

  mkdirSync(CACHE_DIR, { recursive: true });
  const outPath = join(CACHE_DIR, "bedutil.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath} (${Object.keys(states).length} states)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

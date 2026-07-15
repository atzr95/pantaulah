/**
 * Fetches hospital bed & ICU utilization from KKMNow Parquet file
 * and saves as cached JSON for the API route to serve.
 *
 * Run: npx tsx scripts/ingest-bedutil.ts
 *
 * This exists because hyparquet + Brotli compressors need WASM which
 * doesn't work on Cloudflare's edge runtime. So we parse at build time.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
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

/** Recursive sorted-key replacer so output is deterministic across runs */
function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return sorted;
  }
  return value;
}

function stableStringify(data: object): string {
  return JSON.stringify(data, sortKeysReplacer);
}

/**
 * Write minified JSON only if content (ignoring fetchedAt) actually changed.
 * Skipping the write preserves the old fetchedAt and produces no git diff.
 */
function writeJsonIfChanged(path: string, data: object): boolean {
  if (existsSync(path)) {
    try {
      const { fetchedAt: _prev, ...prevRest } = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      const { fetchedAt: _next, ...nextRest } = data as Record<string, unknown>;
      if (stableStringify(prevRest) === stableStringify(nextRest)) return false;
    } catch { /* unreadable — rewrite */ }
  }
  writeFileSync(path, stableStringify(data));
  return true;
}

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

  // Upstream publishes irregularly (frozen since mid-2025 as of writing), so
  // record the file's Last-Modified as the true data vintage for the UI.
  const lastModified = res.headers.get("last-modified");
  const asOf = lastModified ? new Date(lastModified).toISOString() : null;

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

  mkdirSync(CACHE_DIR, { recursive: true });
  const outPath = join(CACHE_DIR, "bedutil.json");

  // Sanity gate: never replace a healthy cache with an empty/sparse parse
  if (existsSync(outPath)) {
    try {
      const previous = JSON.parse(readFileSync(outPath, "utf-8")) as { states?: Record<string, unknown> };
      const prevCount = Object.keys(previous.states ?? {}).length;
      const newCount = Object.keys(states).length;
      if (prevCount > 0 && newCount < prevCount * 0.5) {
        console.warn(`!! WARNING: parsed only ${newCount} states (previous cache has ${prevCount}) — keeping previous data.`);
        return;
      }
    } catch { /* unreadable — rewrite */ }
  }

  const output = { states, national, asOf, fetchedAt: new Date().toISOString() };
  if (writeJsonIfChanged(outPath, output)) {
    console.log(`Wrote ${outPath} (${Object.keys(states).length} states)`);
  } else {
    console.log("Cache content unchanged — write skipped (fetchedAt preserved).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

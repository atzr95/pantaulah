import { NextResponse } from "next/server";
import bedutilCache from "@/lib/data/cache/bedutil.json";

export const runtime = "edge";

/**
 * Serves hospital bed & ICU utilization from pre-cached JSON.
 *
 * The Parquet source (storage.data.gov.my) uses Brotli compression which
 * needs WASM decompressors — these don't work on Cloudflare's edge runtime.
 * Instead, we parse during build/ingest (scripts/ingest-bedutil.ts) and
 * serve the cached result here.
 *
 * Run `npx tsx scripts/ingest-bedutil.ts` to refresh the cache.
 */

export async function GET() {
  return NextResponse.json(bedutilCache, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveState, matchHeadlineToStates } from "@/lib/data/states";

/** Visitor's Malaysian state from Cloudflare's request geo data; null outside MY or when unknown */
export async function GET() {
  const cf = getCloudflareContext().cf as { country?: string; region?: string } | undefined;
  const region = cf?.country === "MY" ? cf.region : undefined;
  // ponytail: match by region name; add an ISO 3166-2 regionCode table if names ever stop matching
  const state = region ? (resolveState(region) ?? matchHeadlineToStates(region)[0]) : undefined;
  return NextResponse.json(
    { state: state?.topoName ?? null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

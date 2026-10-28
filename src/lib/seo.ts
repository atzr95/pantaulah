/**
 * Crawler-facing content: the text summary rendered on the home page,
 * llms.txt, and schema.org JSON-LD. The map itself is client-only, so this
 * is all a non-JavaScript crawler can read about the dashboard.
 */

import { CATEGORY_METRICS } from "@/lib/data/choropleth";
import { MALAYSIA_STATES } from "@/lib/data/states";
import ingestMeta from "@/lib/data/cache/ingest-meta.json";
import {
  DATA_SOURCES,
  GITHUB_URL,
  LIVE_FEEDS,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

/** Most recent successful ingest of any cadence, as an ISO timestamp. */
export const DATA_LAST_UPDATED: string = Object.values(ingestMeta as Record<string, string>)
  .filter((v) => !Number.isNaN(Date.parse(v)))
  .sort()
  .at(-1) ?? new Date(0).toISOString();

export interface MetricCategory {
  name: string;
  metrics: { label: string; description: string }[];
}

export const METRIC_CATEGORIES: MetricCategory[] = Object.entries(CATEGORY_METRICS).map(
  ([key, metrics]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    metrics: metrics.map(({ label, description }) => ({ label, description })),
  }),
);

export const STATE_LIST = MALAYSIA_STATES.map((s) => ({
  name: s.topoName,
  capital: s.capital,
  isFederalTerritory: s.isFederalTerritory,
}));

/** llms.txt per https://llmstxt.org: H1, blockquote summary, then link sections. */
export function buildLlmsTxt(): string {
  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Pantaulah is a free, open-source dashboard. Visitors pick a metric and see every Malaysian state and federal territory on a choropleth map, with a brief for each state. Statistics come from official sources; each value carries its own reference year, so annual figures are not live. Live layers (weather, floods, transit, flights) refresh while the page is open.",
    "",
    `Data last ingested: ${DATA_LAST_UPDATED.slice(0, 10)}.`,
    "",
    "## Pages",
    "",
    `- [Dashboard](${SITE_URL}/): Interactive map of state statistics and live feeds`,
    `- [About](${SITE_URL}/about): Project background, data sources and licence`,
    "",
    "## State metrics",
    "",
  ];
  for (const category of METRIC_CATEGORIES) {
    lines.push(`### ${category.name}`, "");
    for (const m of category.metrics) lines.push(`- ${m.label}: ${m.description}`);
    lines.push("");
  }
  lines.push("## Live feeds", "");
  for (const feed of LIVE_FEEDS) lines.push(`- ${feed}`);
  lines.push("", "## States and federal territories", "");
  for (const s of STATE_LIST) {
    lines.push(`- ${s.name}${s.isFederalTerritory ? " (federal territory)" : ""}: capital ${s.capital}`);
  }
  lines.push("", "## Data sources", "");
  for (const source of DATA_SOURCES) lines.push(`- [${source.name}](${source.url}): ${source.description}`);
  lines.push("", "## Optional", "", `- [Source code](${GITHUB_URL}): MIT-licensed repository`, "");
  return lines.join("\n");
}

export function buildJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        alternateName: SITE_TITLE,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/#dataset`,
        name: "Malaysia state statistics (Pantaulah)",
        description:
          "State-level statistics for all 13 states and 3 federal territories of Malaysia, compiled from official sources: economy (GDP, unemployment, household income, CPI, food prices), crime, health, transport, education, energy and water.",
        url: `${SITE_URL}/`,
        sameAs: GITHUB_URL,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
        spatialCoverage: { "@type": "Place", name: "Malaysia" },
        dateModified: DATA_LAST_UPDATED,
        keywords: ["Malaysia", "state statistics", ...METRIC_CATEGORIES.map((c) => c.name)],
        variableMeasured: METRIC_CATEGORIES.flatMap((c) => c.metrics.map((m) => m.label)),
        isBasedOn: DATA_SOURCES.map((s) => s.url),
      },
    ],
  };
}

/** Serialize for a <script type="application/ld+json"> without allowing tag break-out. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

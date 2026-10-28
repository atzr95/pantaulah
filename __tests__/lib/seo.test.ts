import { describe, it, expect } from "vitest";
import { buildJsonLd, buildLlmsTxt, METRIC_CATEGORIES, serializeJsonLd, STATE_LIST } from "@/lib/seo";
import { METRIC_CONFIGS } from "@/lib/data/choropleth";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

describe("buildLlmsTxt", () => {
  const txt = buildLlmsTxt();

  it("starts with an H1 and a blockquote summary", () => {
    const [h1, blank, quote] = txt.split("\n");
    expect(h1).toBe("# PANTAULAH");
    expect(blank).toBe("");
    expect(quote.startsWith("> ")).toBe(true);
  });

  it("lists every state and every metric", () => {
    for (const s of STATE_LIST) expect(txt).toContain(`- ${s.name}`);
    for (const m of METRIC_CONFIGS) expect(txt).toContain(`- ${m.label}: `);
  });

  it("uses absolute links", () => {
    expect(txt).toContain(`(${SITE_URL}/about)`);
  });
});

describe("JSON-LD", () => {
  it("describes the site and dataset", () => {
    const types = buildJsonLd()["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(["WebSite", "Dataset"]);
  });

  it("measures every metric", () => {
    const dataset = buildJsonLd()["@graph"][1] as { variableMeasured: string[] };
    expect(dataset.variableMeasured).toHaveLength(METRIC_CONFIGS.length);
  });

  it("escapes < so the script tag cannot be closed early", () => {
    const out = serializeJsonLd({ x: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).x).toBe("</script><script>alert(1)</script>");
  });
});

describe("crawler routes", () => {
  it("robots blocks API routes but keeps OG images and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", disallow: "/api/" });
    expect((r.rules as { allow: string[] }).allow).toContain("/api/og");
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("sitemap lists the indexable pages", () => {
    expect(sitemap().map((e) => e.url)).toEqual([`${SITE_URL}/`, `${SITE_URL}/about`]);
  });

  it("groups metrics by category", () => {
    expect(METRIC_CATEGORIES.map((c) => c.name)).toContain("Economy");
  });
});

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import type { Headline, ExchangeRate, FuelPrice, TickerData } from "@/lib/data/types";
import { matchHeadlineToStates } from "@/lib/data/states";

// BNM response schema (Zod validation)
const BnmRateSchema = z.object({
  data: z.array(
    z.object({
      currency_code: z.string(),
      rate: z.object({
        middle_rate: z.number(),
      }),
    })
  ),
});

const BnmOprSchema = z.object({
  data: z.object({
    new_opr_level: z.number(),
  }),
});

async function fetchBnmRates(): Promise<ExchangeRate[]> {
  try {
    const res = await fetch("https://api.bnm.gov.my/public/exchange-rate", {
      headers: { Accept: "application/vnd.BNM.API.v1+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const parsed = BnmRateSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("BNM rate schema mismatch:", parsed.error);
      return [];
    }
    const currencyOrder = ["USD", "SGD", "EUR", "GBP", "JPY"];
    return parsed.data.data
      .filter((r) => currencyOrder.includes(r.currency_code))
      .sort((a, b) => currencyOrder.indexOf(a.currency_code) - currencyOrder.indexOf(b.currency_code))
      .map((r) => ({
        currency: r.currency_code,
        rate: r.rate.middle_rate,
      }));
  } catch (err) {
    console.error("BNM fetch error:", err);
    return [];
  }
}

async function fetchOpr(): Promise<number | undefined> {
  try {
    const res = await fetch("https://api.bnm.gov.my/public/opr", {
      headers: { Accept: "application/vnd.BNM.API.v1+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const raw = await res.json();
    const parsed = BnmOprSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    return parsed.data.data.new_opr_level;
  } catch {
    return undefined;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ");
}

async function fetchRssHeadlines(
  feedUrl: string,
  sourceName: string
): Promise<Headline[]> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const text = await res.text();

    // Simple RSS XML parsing (no external dependency)
    const items: Headline[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const itemXml = match[1];
      const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] ??
        itemXml.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      if (title) {
        const decoded = decodeHtmlEntities(title.trim());
        const matched = matchHeadlineToStates(decoded);
        items.push({
          title: decoded,
          source: sourceName,
          url: link.trim(),
          publishedAt: pubDate,
          matchedStates: matched.map((s) => s.topoName),
        });
      }
    }
    return items.slice(0, 20); // Max 20 per feed
  } catch {
    return [];
  }
}

const FuelSchema = z.array(
  z.object({
    date: z.string(),
    ron95: z.number(),
    ron97: z.number(),
    diesel: z.number(),
    ron95_budi95: z.number().optional(),
    diesel_eastmsia: z.number().optional(),
    series_type: z.string(),
  })
);

async function fetchFuelPrices(): Promise<FuelPrice | undefined> {
  try {
    const res = await fetch(
      "https://api.data.gov.my/data-catalogue/?id=fuelprice&sort=-date&limit=2",
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return undefined;
    const raw = await res.json();
    const parsed = FuelSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const level = parsed.data.find((d) => d.series_type === "level");
    if (!level) return undefined;
    return {
      ron95: level.ron95,
      ron97: level.ron97,
      diesel: level.diesel,
      ron95Budi: level.ron95_budi95,
      dieselEastMsia: level.diesel_eastmsia,
      date: level.date,
    };
  } catch {
    return undefined;
  }
}

export async function GET() {
  const [rates, opr, fuel, malayMailHeadlines, fmtHeadlines, bernamaHeadlines] =
    await Promise.all([
      fetchBnmRates(),
      fetchOpr(),
      fetchFuelPrices(),
      fetchRssHeadlines("https://www.malaymail.com/feed/rss/malaysia", "MALAY MAIL"),
      fetchRssHeadlines("https://www.freemalaysiatoday.com/feed", "FMT"),
      fetchRssHeadlines("https://www.bernama.com/en/rssfeed.php", "BERNAMA"),
    ]);

  const headlines = [...malayMailHeadlines, ...fmtHeadlines, ...bernamaHeadlines]
    .sort((a, b) => {
      const da = new Date(a.publishedAt).getTime();
      const db = new Date(b.publishedAt).getTime();
      return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
    })
    .slice(0, 30);

  const tickerData: TickerData = {
    headlines,
    rates,
    opr,
    fuel,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(tickerData, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=1800" },
  });
}

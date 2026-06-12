import { NextResponse } from "next/server";
import { z } from "zod/v4";
import type { Headline, ExchangeRate, FuelPrice, GoldPrice, TickerData } from "@/lib/data/types";

import { matchHeadlineToStates } from "@/lib/data/states";
import { cachedJson } from "@/lib/server/edge-cache";
import { fetchFeedItems } from "@/lib/server/rss";

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

const BnmKijangEmasSchema = z.object({
  data: z.object({
    effective_date: z.string(),
    one_oz: z.object({
      selling: z.number(),
    }),
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

const TROY_OZ_GRAMS = 31.1035;

async function fetchGoldPrice(): Promise<GoldPrice | undefined> {
  try {
    const res = await fetch("https://api.bnm.gov.my/public/kijang-emas", {
      headers: { Accept: "application/vnd.BNM.API.v1+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return undefined;
    const raw = await res.json();
    const parsed = BnmKijangEmasSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const { effective_date, one_oz } = parsed.data.data;
    const pricePerGram999 = one_oz.selling / TROY_OZ_GRAMS;
    return {
      gold999: Math.round(pricePerGram999 * 100) / 100,
      gold916: Math.round(pricePerGram999 * 0.916 * 100) / 100,
      effectiveDate: effective_date,
    };
  } catch {
    return undefined;
  }
}

async function fetchRssHeadlines(
  feedUrl: string,
  sourceName: string
): Promise<Headline[]> {
  try {
    const items = await fetchFeedItems(feedUrl);
    return items.slice(0, 20).map((item) => ({
      title: item.title,
      source: sourceName,
      url: item.link,
      publishedAt: item.pubDate,
      matchedStates: matchHeadlineToStates(item.title).map((s) => s.topoName),
    }));
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
  const tickerData = await cachedJson<TickerData>("ticker:data", 900, async () => {
    const [rates, opr, fuel, gold, malayMailHeadlines, fmtHeadlines, bernamaHeadlines] =
      await Promise.all([
        fetchBnmRates(),
        fetchOpr(),
        fetchFuelPrices(),
        fetchGoldPrice(),
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

    return {
      headlines,
      rates,
      opr,
      fuel,
      gold,
      fetchedAt: new Date().toISOString(),
    };
  });

  return NextResponse.json(tickerData, {
    headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=900" },
  });
}

import { NextResponse } from "next/server";
import { matchHeadlineToStates } from "@/lib/data/states";


// ── Malaysian news RSS feeds ──

const RSS_FEEDS = [
  {
    name: "The Star",
    url: "https://www.thestar.com.my/rss/News",
    source: "thestar.com.my",
  },
  {
    name: "The Star",
    url: "https://www.thestar.com.my/rss/Business",
    source: "thestar.com.my",
  },
  {
    name: "The Star",
    url: "https://www.thestar.com.my/rss/Tech",
    source: "thestar.com.my",
  },
  {
    name: "Malaysiakini",
    url: "https://www.malaysiakini.com/rss/en/news.rss",
    source: "malaysiakini.com",
  },
  {
    name: "Malay Mail",
    url: "https://www.malaymail.com/feed/rss/malaysia",
    source: "malaymail.com",
  },
  {
    name: "Malay Mail",
    url: "https://www.malaymail.com/feed/rss/money",
    source: "malaymail.com",
  },
  {
    name: "Free Malaysia Today",
    url: "https://www.freemalaysiatoday.com/rss/",
    source: "freemalaysiatoday.com",
  },
  {
    name: "New Straits Times",
    url: "https://www.nst.com.my/rss",
    source: "nst.com.my",
  },
  {
    name: "Bernama",
    url: "https://www.bernama.com/en/rss/news.xml",
    source: "bernama.com",
  },
  {
    name: "The Edge",
    url: "https://theedgemalaysia.com/rss",
    source: "theedgemalaysia.com",
  },
  {
    name: "Harian Metro",
    url: "https://www.hmetro.com.my/rss",
    source: "hmetro.com.my",
  },
  {
    name: "Says",
    url: "https://says.com/my/rss",
    source: "says.com",
  },
];

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceName: string;
  description: string;
  matchedStates: string[];
}

// ── Simple XML text extractor ──

function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataRe = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractItems(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  description: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
  }> = [];

  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description")
      .replace(/<[^>]*>/g, "") // strip HTML tags
      .substring(0, 200);
    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }

  return items;
}

// ── Cache ──

let cache: { items: RssItem[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchAllFeeds(): Promise<RssItem[]> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.items;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Pantaulah/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const xml = await res.text();
      return extractItems(xml).map((item) => ({
        ...item,
        source: feed.source,
        sourceName: feed.name,
        matchedStates: matchHeadlineToStates(item.title).map((s) => s.topoName),
      }));
    })
  );

  const allItems: RssItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allItems.push(...r.value);
  }

  // Sort by publish date (newest first)
  allItems.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  // Keep top 200
  const trimmed = allItems.slice(0, 200);
  cache = { items: trimmed, ts: now };
  return trimmed;
}

// ── Route handler ──

export async function GET() {
  try {
    const items = await fetchAllFeeds();
    return NextResponse.json({ items }, { headers: { "Cache-Control": "s-maxage=300" } });
  } catch {
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}

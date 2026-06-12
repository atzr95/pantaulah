import { cachedJson } from "./edge-cache";

export interface RawRssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

const FEED_TTL_SECONDS = 300;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ");
}

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

export function parseRssItems(xml: string): RawRssItem[] {
  const items: RawRssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeHtmlEntities(extractTag(block, "title"));
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = decodeHtmlEntities(
      extractTag(block, "description").replace(/<[^>]*>/g, "")
    ).substring(0, 200);
    if (title) {
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

/**
 * Fetch + parse an RSS feed, edge-cached per feed URL so overlapping feeds
 * (ticker + media views) hit each publisher once per cache window.
 * Throws on upstream failure — failures are never cached.
 */
export async function fetchFeedItems(feedUrl: string): Promise<RawRssItem[]> {
  return cachedJson<RawRssItem[]>(`rss:feed:${feedUrl}`, FEED_TTL_SECONDS, async () => {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "Pantaulah/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RSS feed ${feedUrl}: ${res.status}`);
    const xml = await res.text();
    return parseRssItems(xml);
  });
}

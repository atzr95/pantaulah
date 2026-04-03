import { NextResponse } from "next/server";

export const runtime = "edge";

interface LiveChannel {
  name: string;
  handle: string;
  description: string;
  videoId: string | null;
}

interface LiveResponse {
  channels: LiveChannel[];
  fetchedAt: string;
}

const CHANNELS = [
  { name: "Astro Awani", handle: "astroawani", description: "24/7 News" },
  { name: "Berita RTM", handle: "BeritaRTMBES", description: "RTM News" },
  { name: "Al Jazeera", handle: "AlJazeeraEnglish", description: "International News" },
  { name: "CNA", handle: "channelnewsasia", description: "Asia / World News" },
];

// ── In-memory cache ──
let cached: { body: string; time: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

/** Fetch a YouTube channel's live page and extract the video ID */
async function resolveLiveVideoId(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/@${handle}/live`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for canonical URL with video ID (present on live stream pages)
    const canonicalMatch = html.match(
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/
    );
    if (canonicalMatch) {
      // Verify it's actually live by checking for live badge in the page
      const isLive =
        html.includes('"isLive":true') ||
        html.includes('"isLiveNow":true') ||
        html.includes('"liveBadge"') ||
        html.includes('"BADGE_STYLE_TYPE_LIVE_NOW"');
      if (isLive) return canonicalMatch[1];
    }

    // Fallback: look for videoId in the page JSON data
    const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (videoIdMatch) {
      const isLive =
        html.includes('"isLive":true') || html.includes('"isLiveNow":true');
      if (isLive) return videoIdMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Serve from cache if fresh
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return new NextResponse(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
      },
    });
  }

  const results = await Promise.all(
    CHANNELS.map(async (ch) => {
      const videoId = await resolveLiveVideoId(ch.handle);
      return {
        name: ch.name,
        handle: ch.handle,
        description: ch.description,
        videoId,
      };
    })
  );

  const data: LiveResponse = {
    channels: results,
    fetchedAt: new Date().toISOString(),
  };

  const body = JSON.stringify(data);
  cached = { body, time: Date.now() };

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
    },
  });
}

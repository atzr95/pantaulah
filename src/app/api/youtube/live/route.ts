import { NextResponse } from "next/server";


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
// Successful responses (≥1 live channel) cache for 5 min. Fully-empty
// responses cache for 30s so a transient YouTube hiccup doesn't pin
// viewers to "no live streams" until the long TTL expires.
let cached: { body: string; time: number; ttl: number } | null = null;
const CACHE_TTL_OK_MS = 5 * 60_000;
const CACHE_TTL_EMPTY_MS = 30_000;

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

    // When a channel is live, the /live page's canonical link points to
    // /watch?v=XXXXXXXXXXX (the current live stream). When offline, it
    // points to /channel/... instead. The canonical is re-pointed by
    // YouTube every new stream, so this auto-survives restarts.
    const canonicalMatch = html.match(
      /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/
    );
    if (canonicalMatch) return canonicalMatch[1];

    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Serve from cache if fresh
  if (cached && Date.now() - cached.time < cached.ttl) {
    return new NextResponse(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cached.ttl === CACHE_TTL_OK_MS
          ? "public, max-age=120, stale-while-revalidate=300"
          : "public, max-age=30, stale-while-revalidate=60",
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

  const hasAnyLive = results.some((r) => r.videoId);
  const ttl = hasAnyLive ? CACHE_TTL_OK_MS : CACHE_TTL_EMPTY_MS;
  const body = JSON.stringify(data);
  cached = { body, time: Date.now(), ttl };

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": hasAnyLive
        ? "public, max-age=120, stale-while-revalidate=300"
        : "public, max-age=30, stale-while-revalidate=60",
    },
  });
}

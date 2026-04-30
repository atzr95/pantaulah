import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";


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
let cached: { body: string; time: number; ttl: number } | null = null;
const CACHE_TTL_OK_MS = 5 * 60_000;
const CACHE_TTL_EMPTY_MS = 2 * 60_000;

const UPLOADS_LOOKBACK = 50;

// Per-isolate caches.
//   - Channel handle → channelId + uploads playlist ID. Permanent (never changes).
//   - Channel handle → last-known-live videoId. Used for cheap re-verification
//     so we don't re-pay 100-unit search.list every refresh.
const channelMetaCache = new Map<
  string,
  { channelId: string; uploadsPlaylistId: string } | null
>();
const lastKnownLiveCache = new Map<string, string>();

async function resolveChannelMeta(
  handle: string,
  apiKey: string
): Promise<{ channelId: string; uploadsPlaylistId: string } | null> {
  if (channelMetaCache.has(handle)) return channelMetaCache.get(handle)!;

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id,contentDetails");
  url.searchParams.set("forHandle", handle);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`channels.list failed for @${handle}:`, await res.text());
      channelMetaCache.set(handle, null);
      return null;
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    };
    const item = json.items?.[0];
    const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
    const meta =
      item?.id && uploads
        ? { channelId: item.id, uploadsPlaylistId: uploads }
        : null;
    channelMetaCache.set(handle, meta);
    return meta;
  } catch (err) {
    console.error(`channels.list error for @${handle}:`, err);
    return null;
  }
}

/** Batch-check which of the given video IDs are currently live. 1 quota unit. */
async function checkLiveBatch(
  videoIds: string[],
  apiKey: string
): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("videos.list (live check) failed:", await res.text());
      return new Set();
    }
    const json = (await res.json()) as {
      items?: Array<{
        id: string;
        snippet: { liveBroadcastContent?: string };
      }>;
    };
    return new Set(
      (json.items ?? [])
        .filter((v) => v.snippet.liveBroadcastContent === "live")
        .map((v) => v.id)
    );
  } catch (err) {
    console.error("videos.list (live check) error:", err);
    return new Set();
  }
}

/** Cheap: scan recent uploads for a live broadcast. ~2 quota units. */
async function findLiveInRecentUploads(
  uploadsPlaylistId: string,
  apiKey: string
): Promise<string | null> {
  const itemsUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  itemsUrl.searchParams.set("part", "contentDetails");
  itemsUrl.searchParams.set("playlistId", uploadsPlaylistId);
  itemsUrl.searchParams.set("maxResults", String(UPLOADS_LOOKBACK));
  itemsUrl.searchParams.set("key", apiKey);

  try {
    const res = await fetch(itemsUrl.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{ contentDetails: { videoId: string } }>;
    };
    const ids = (json.items ?? []).map((it) => it.contentDetails.videoId);
    if (ids.length === 0) return null;
    const live = await checkLiveBatch(ids, apiKey);
    return ids.find((id) => live.has(id)) ?? null;
  } catch (err) {
    console.error(`playlistItems.list error for ${uploadsPlaylistId}:`, err);
    return null;
  }
}

/** Expensive fallback: search.list eventType=live. 100 quota units. */
async function searchLiveVideoId(
  channelId: string,
  apiKey: string
): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "id");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`search.list (live) failed for ${channelId}:`, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      items?: Array<{ id: { videoId: string } }>;
    };
    return json.items?.[0]?.id?.videoId ?? null;
  } catch (err) {
    console.error(`search.list (live) error for ${channelId}:`, err);
    return null;
  }
}

async function discoverLiveForChannel(
  handle: string,
  apiKey: string
): Promise<string | null> {
  const meta = await resolveChannelMeta(handle, apiKey);
  if (!meta) return null;

  const cheap = await findLiveInRecentUploads(meta.uploadsPlaylistId, apiKey);
  if (cheap) return cheap;

  return await searchLiveVideoId(meta.channelId, apiKey);
}

export async function GET() {
  const { env } = getCloudflareContext();
  const apiKey =
    (env as Record<string, string>).YOUTUBE_API_KEY ??
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not configured" },
      { status: 503 }
    );
  }

  if (cached && Date.now() - cached.time < cached.ttl) {
    return new NextResponse(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cached.ttl === CACHE_TTL_OK_MS
          ? "public, max-age=120, stale-while-revalidate=300"
          : "public, max-age=60, stale-while-revalidate=120",
      },
    });
  }

  // Step 1 — batch-verify all cached video IDs in a single 1-unit call.
  const cachedPairs = CHANNELS.map((ch) => ({
    handle: ch.handle,
    videoId: lastKnownLiveCache.get(ch.handle),
  })).filter((p): p is { handle: string; videoId: string } => !!p.videoId);

  const stillLive = await checkLiveBatch(
    cachedPairs.map((p) => p.videoId),
    apiKey
  );

  // Step 2 — for channels with no valid cached ID, discover via cheap → expensive paths.
  const results = await Promise.all(
    CHANNELS.map(async (ch) => {
      const cachedVid = lastKnownLiveCache.get(ch.handle);
      if (cachedVid && stillLive.has(cachedVid)) {
        return {
          name: ch.name,
          handle: ch.handle,
          description: ch.description,
          videoId: cachedVid,
        };
      }

      const videoId = await discoverLiveForChannel(ch.handle, apiKey);
      if (videoId) lastKnownLiveCache.set(ch.handle, videoId);
      else lastKnownLiveCache.delete(ch.handle);

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
        : "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

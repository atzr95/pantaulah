import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  cachedJson,
  edgeGet,
  edgePut,
  runInBackground,
} from "@/lib/server/edge-cache";


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

// ── Cache config ──
// Edge-cached (shared across isolates):
//   - yt:live:response  → assembled response. 5 min when something is live, 2 min when not.
//   - yt:channelMeta:*  → channelId + uploads playlist ID, 24h (effectively never changes).
//   - yt:lastKnownLive  → handle → last-known-live videoId, 1h. Used for cheap
//     re-verification so we don't re-pay 100-unit search.list every refresh.
const RESPONSE_CACHE_KEY = "yt:live:response";
const RESPONSE_TTL_OK = 300;
const RESPONSE_TTL_EMPTY = 120;
const CHANNEL_META_TTL = 86_400;
const LAST_KNOWN_LIVE_KEY = "yt:lastKnownLive";
const LAST_KNOWN_LIVE_TTL = 3_600;

const UPLOADS_LOOKBACK = 50;

async function resolveChannelMeta(
  handle: string,
  apiKey: string
): Promise<{ channelId: string; uploadsPlaylistId: string } | null> {
  try {
    return await cachedJson<{
      channelId: string;
      uploadsPlaylistId: string;
    } | null>(`yt:channelMeta:${handle}`, CHANNEL_META_TTL, async () => {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "id,contentDetails");
      url.searchParams.set("forHandle", handle);
      url.searchParams.set("key", apiKey);

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        // API failure — throw so it's never cached as "no such channel"
        console.error(`channels.list failed for @${handle}:`, await res.text());
        throw new Error(`channels.list ${res.status}`);
      }
      const json = (await res.json()) as {
        items?: Array<{
          id: string;
          contentDetails?: { relatedPlaylists?: { uploads?: string } };
        }>;
      };
      const item = json.items?.[0];
      const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
      return item?.id && uploads
        ? { channelId: item.id, uploadsPlaylistId: uploads }
        : null;
    });
  } catch (err) {
    console.error(`channels.list error for @${handle}:`, err);
    return null;
  }
}

/**
 * Batch-check which of the given video IDs are currently live. 1 quota unit.
 * Returns null when the API call itself failed (vs. "none of these are live"),
 * so callers can avoid evicting cached IDs on transient errors.
 */
async function checkLiveBatch(
  videoIds: string[],
  apiKey: string
): Promise<Set<string> | null> {
  if (videoIds.length === 0) return new Set();

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("videos.list (live check) failed:", await res.text());
      return null;
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
    return null;
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
    const res = await fetch(itemsUrl.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{ contentDetails: { videoId: string } }>;
    };
    const ids = (json.items ?? []).map((it) => it.contentDetails.videoId);
    if (ids.length === 0) return null;
    const live = await checkLiveBatch(ids, apiKey);
    if (!live) return null;
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
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
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

  const cachedData = await edgeGet<LiveResponse>(RESPONSE_CACHE_KEY);
  if (cachedData) {
    const anyLive = cachedData.channels.some((c) => c.videoId);
    return new NextResponse(JSON.stringify(cachedData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": anyLive
          ? "public, max-age=120, stale-while-revalidate=300"
          : "public, max-age=60, stale-while-revalidate=120",
      },
    });
  }

  const lastKnownLive =
    (await edgeGet<Record<string, string>>(LAST_KNOWN_LIVE_KEY)) ?? {};

  // Step 1 — batch-verify all cached video IDs in a single 1-unit call.
  const cachedIds = CHANNELS.map((ch) => lastKnownLive[ch.handle]).filter(
    (id): id is string => !!id
  );
  const stillLive = await checkLiveBatch(cachedIds, apiKey);

  // Step 2 — for channels with no valid cached ID, discover via cheap → expensive paths.
  const results = await Promise.all(
    CHANNELS.map(async (ch) => {
      const cachedVid = lastKnownLive[ch.handle];
      if (cachedVid) {
        // Live check failed (vs. "not live") — keep the cached ID rather than
        // evicting and re-paying discovery over a transient error.
        if (stillLive === null || stillLive.has(cachedVid)) {
          return {
            name: ch.name,
            handle: ch.handle,
            description: ch.description,
            videoId: cachedVid,
          };
        }
        // API explicitly said this video is no longer live.
        delete lastKnownLive[ch.handle];
      }

      const videoId = await discoverLiveForChannel(ch.handle, apiKey);
      if (videoId) lastKnownLive[ch.handle] = videoId;

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
  runInBackground(
    edgePut(LAST_KNOWN_LIVE_KEY, lastKnownLive, LAST_KNOWN_LIVE_TTL)
  );
  runInBackground(
    edgePut(
      RESPONSE_CACHE_KEY,
      data,
      hasAnyLive ? RESPONSE_TTL_OK : RESPONSE_TTL_EMPTY
    )
  );

  return new NextResponse(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": hasAnyLive
        ? "public, max-age=120, stale-while-revalidate=300"
        : "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cachedJson } from "@/lib/server/edge-cache";


export interface TrendingVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string; // ISO 8601
  isShort: boolean;
  categoryId: string;
}

interface TrendingResponse {
  videos: TrendingVideo[];
  shorts: TrendingVideo[];
  fetchedAt: string;
}

const CACHE_TTL_SECONDS = 900; // 15 minutes

/** Parse ISO 8601 duration to seconds */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function parseItems(items: any[]): TrendingVideo[] {
      return items.map((item) => {
        const durationSec = parseDuration(
          item.contentDetails?.duration ?? "PT0S"
        );
        return {
          id: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail:
            item.snippet.thumbnails?.high?.url ??
            item.snippet.thumbnails?.medium?.url ??
            item.snippet.thumbnails?.default?.url,
          publishedAt: item.snippet.publishedAt,
          viewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
          likeCount: parseInt(item.statistics?.likeCount ?? "0", 10),
          commentCount: parseInt(item.statistics?.commentCount ?? "0", 10),
          duration: item.contentDetails?.duration ?? "PT0S",
          isShort: durationSec > 0 && durationSec <= 60,
          categoryId: item.snippet.categoryId ?? "",
        };
      });
    }

    const data = await cachedJson<TrendingResponse>(
      "yt:trending",
      CACHE_TTL_SECONDS,
      async () => {
        // Fetch page 1
        const url = new URL("https://www.googleapis.com/youtube/v3/videos");
        url.searchParams.set("part", "snippet,statistics,contentDetails");
        url.searchParams.set("chart", "mostPopular");
        url.searchParams.set("regionCode", "MY");
        url.searchParams.set("maxResults", "50");
        url.searchParams.set("key", apiKey);

        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("YouTube API error:", err);
          throw new Error("yt-api-failed");
        }

        const json = await res.json();
        let allVideos = parseItems(json.items ?? []);

        // Fetch page 2 if there's a next page token
        if (json.nextPageToken) {
          url.searchParams.set("pageToken", json.nextPageToken);
          const res2 = await fetch(url.toString(), {
            signal: AbortSignal.timeout(8_000),
          });
          if (res2.ok) {
            const json2 = await res2.json();
            allVideos = allVideos.concat(parseItems(json2.items ?? []));
          }
        }

        return {
          videos: allVideos.filter((v) => !v.isShort).slice(0, 30),
          shorts: allVideos.filter((v) => v.isShort).slice(0, 30),
          fetchedAt: new Date().toISOString(),
        };
      }
    );

    return new NextResponse(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "yt-api-failed") {
      return NextResponse.json(
        { error: "YouTube API request failed" },
        { status: 502 }
      );
    }
    console.error("YouTube trending fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch trending videos" },
      { status: 500 }
    );
  }
}

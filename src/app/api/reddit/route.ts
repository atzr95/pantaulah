import { NextResponse } from "next/server";

interface RedditPost {
  title: string;
  score: number;
  numComments: number;
  permalink: string;
  url: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  thumbnail: string | null;
  selftext: string;
  linkFlair: string | null;
  isVideo: boolean;
  domain: string;
}

interface RedditResponse {
  subredditPosts: RedditPost[];
  globalPosts: RedditPost[];
  fetchedAt: string;
}

// ── In-memory cache ──
let cached: { body: string; time: number } | null = null;
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes

const USER_AGENT = "pantaulah:v1.0.0 (malaysia-intelligence-terminal)";

function parseRedditChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
): RedditPost[] {
  return children.map((child) => {
    const d = child.data;
    // Prefer high-res preview image over tiny thumbnail
    const previewUrl =
      d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&") ?? null;
    const rawThumb =
      d.thumbnail && d.thumbnail !== "self" && d.thumbnail !== "default" && d.thumbnail !== "nsfw" && d.thumbnail !== "spoiler"
        ? d.thumbnail
        : null;
    const thumb = previewUrl || rawThumb;
    return {
      title: d.title,
      score: d.score,
      numComments: d.num_comments,
      permalink: `https://www.reddit.com${d.permalink}`,
      url: d.url,
      author: d.author,
      subreddit: d.subreddit_name_prefixed,
      createdUtc: d.created_utc,
      thumbnail: thumb,
      selftext: d.selftext?.slice(0, 200) ?? "",
      linkFlair: d.link_flair_text ?? null,
      isVideo: d.is_video ?? false,
      domain: d.domain ?? "",
    };
  });
}

async function fetchRedditJson(url: string): Promise<RedditPost[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return parseRedditChildren(json?.data?.children ?? []);
}

export async function GET() {
  // Serve from cache if fresh
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return new NextResponse(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  }

  const [subredditPosts, globalPosts] = await Promise.all([
    fetchRedditJson(
      "https://www.reddit.com/r/malaysia+bolehland+malaysians/hot.json?limit=20"
    ),
    fetchRedditJson(
      "https://www.reddit.com/search.json?q=malaysia+OR+malaysian+OR+kuala+lumpur&sort=hot&t=day&limit=10"
    ),
  ]);

  const data: RedditResponse = {
    subredditPosts,
    globalPosts,
    fetchedAt: new Date().toISOString(),
  };

  const body = JSON.stringify(data);
  cached = { body, time: Date.now() };

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}

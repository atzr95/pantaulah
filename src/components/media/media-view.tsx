"use client";

import { useState, useEffect } from "react";

// ── Types ──

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

interface TrendingVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  isShort: boolean;
}

interface LiveChannel {
  name: string;
  handle: string;
  description: string;
  videoId: string | null;
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceName: string;
  description: string;
  matchedStates: string[];
}

type MediaTab = "live" | "trending" | "reddit" | "news";

const TABS: Array<{ key: MediaTab; label: string }> = [
  { key: "live", label: "LIVE TV" },
  { key: "trending", label: "TRENDING" },
  { key: "reddit", label: "REDDIT" },
  { key: "news", label: "NEWS" },
];

// ── Helpers ──

function timeAgo(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - utcSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function rssTimeAgo(dateStr: string): string {
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return "";
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function parseDurationDisplay(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Components ──

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-4 bg-[var(--color-cyan)] rounded-sm shadow-[0_0_6px_var(--color-cyan)]" />
      <h2 className="text-[11px] tracking-[2px] text-[var(--color-cyan)] font-bold">
        {title}
      </h2>
      {count != null && (
        <span className="text-[10px] text-[var(--color-text-dim)] tracking-wider">
          ({count})
        </span>
      )}
    </div>
  );
}

// ── Live TV Panel ──

function LiveTVPanel({ compact }: { compact?: boolean }) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gridMode, setGridMode] = useState(true);

  useEffect(() => {
    fetch("/api/youtube/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.channels) setChannels(data.channels);
      })
      .finally(() => setLoading(false));
  }, []);

  const liveChannels = channels.filter((ch) => ch.videoId);
  const offlineChannels = channels.filter((ch) => !ch.videoId);
  const current = liveChannels[activeChannel] ?? liveChannels[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between">
        <SectionHeader title="LIVE BROADCAST" count={liveChannels.length} />
        {!compact && liveChannels.length > 1 && (
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setGridMode(true)}
              className={`p-1 rounded border transition-all ${
                gridMode
                  ? "border-[var(--color-cyan)] text-[var(--color-cyan)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
              }`}
              title="Grid view"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1" />
                <rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => setGridMode(false)}
              className={`p-1 rounded border transition-all ${
                !gridMode
                  ? "border-[var(--color-cyan)] text-[var(--color-cyan)]"
                  : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
              }`}
              title="Single view"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="14" height="14" rx="1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div
          className="relative w-full rounded border border-[var(--color-border)] overflow-hidden mb-3 flex items-center justify-center"
          style={{ aspectRatio: "16/9" }}
        >
          <span className="text-[var(--color-text-dim)] text-xs tracking-wider">
            RESOLVING LIVE STREAMS...
          </span>
        </div>
      ) : liveChannels.length > 0 ? (
        compact ? (
          /* Mobile: single player + channel selector */
          <>
            <div
              className="relative w-full rounded border border-[var(--color-border)] overflow-hidden mb-2"
              style={{ aspectRatio: "16/9" }}
            >
              <iframe
                key={current.videoId}
                src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1&mute=1&modestbranding=1&rel=0`}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={current.name}
              />
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(0,0,0,0.75)] pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-red)] shadow-[0_0_6px_var(--color-red)] animate-pulse" />
                <span className="text-[10px] tracking-wider text-white font-bold">
                  {current.name}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {liveChannels.map((ch, i) => (
                <button
                  key={ch.handle}
                  onClick={() => setActiveChannel(i)}
                  className={`px-2.5 py-1.5 rounded border text-left transition-all ${
                    i === activeChannel
                      ? "bg-[rgba(0,212,255,0.08)] border-[var(--color-cyan)]"
                      : "border-[var(--color-border)] hover:border-[rgba(0,212,255,0.3)] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-red)] shadow-[0_0_4px_var(--color-red)]" />
                    <span className={`text-[10px] font-bold tracking-wider ${
                      i === activeChannel ? "text-[var(--color-cyan)]" : "text-[var(--color-text)]"
                    }`}>
                      {ch.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : !gridMode ? (
          /* Desktop: single player + selector */
          <>
            <div
              className="relative w-full rounded border border-[var(--color-border)] overflow-hidden mb-2"
              style={{ aspectRatio: "16/9" }}
            >
              <iframe
                key={current.videoId}
                src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1&mute=1&modestbranding=1&rel=0`}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={current.name}
              />
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(0,0,0,0.75)] pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-red)] shadow-[0_0_6px_var(--color-red)] animate-pulse" />
                <span className="text-[10px] tracking-wider text-white font-bold">
                  {current.name}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {liveChannels.map((ch, i) => (
                <button
                  key={ch.handle}
                  onClick={() => setActiveChannel(i)}
                  className={`px-2.5 py-1.5 rounded border text-left transition-all ${
                    i === activeChannel
                      ? "bg-[rgba(0,212,255,0.08)] border-[var(--color-cyan)]"
                      : "border-[var(--color-border)] hover:border-[rgba(0,212,255,0.3)] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-red)] shadow-[0_0_4px_var(--color-red)]" />
                    <span className={`text-[10px] font-bold tracking-wider ${
                      i === activeChannel ? "text-[var(--color-cyan)]" : "text-[var(--color-text)]"
                    }`}>
                      {ch.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Desktop: 2x2 grid showing all streams */
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {liveChannels.map((ch) => (
              <div
                key={ch.handle}
                className="relative rounded border border-[var(--color-border)] overflow-hidden"
                style={{ aspectRatio: "4/3" }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${ch.videoId}?autoplay=1&mute=1&modestbranding=1&rel=0`}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={ch.name}
                />
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-[rgba(0,0,0,0.75)] pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-red)] shadow-[0_0_6px_var(--color-red)] animate-pulse" />
                  <span className="text-[10px] tracking-wider text-white font-bold">
                    {ch.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div
          className="relative w-full rounded border border-[var(--color-border)] overflow-hidden mb-3 flex flex-col items-center justify-center gap-2"
          style={{ aspectRatio: "16/9" }}
        >
          <span className="text-[var(--color-amber)] text-xs tracking-wider">
            NO LIVE STREAMS DETECTED
          </span>
          <span className="text-[var(--color-text-dim)] text-[10px] tracking-wider">
            Channels may be offline right now
          </span>
        </div>
      )}

      {/* Offline channels shown dimmed */}
      {offlineChannels.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {offlineChannels.map((ch) => (
            <a
              key={ch.handle}
              href={`https://www.youtube.com/@${ch.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded border border-[var(--color-border)] opacity-40 hover:opacity-60 transition-all"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-dim)]" />
                <span className="text-[10px] font-bold tracking-wider text-[var(--color-text-dim)]">
                  {ch.name}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trending Videos Panel ──

function TrendingPanel() {
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [shorts, setShorts] = useState<TrendingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"videos" | "shorts">("videos");
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/youtube/trending")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        setVideos(data.videos ?? []);
        setShorts(data.shorts ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const list = tab === "videos" ? videos : shorts;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="TRENDING MALAYSIA" count={list.length} />
        <div className="flex gap-1">
          <button
            onClick={() => { setTab("videos"); setPlayingId(null); }}
            className={`px-2 py-0.5 text-[10px] tracking-wider border rounded transition-all ${
              tab === "videos"
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            }`}
          >
            VIDEOS ({videos.length})
          </button>
          <button
            onClick={() => { setTab("shorts"); setPlayingId(null); }}
            className={`px-2 py-0.5 text-[10px] tracking-wider border rounded transition-all ${
              tab === "shorts"
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            }`}
          >
            SHORTS ({shorts.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
          FETCHING TRENDING DATA...
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <span className="text-[var(--color-amber)] text-xs tracking-wider">
            YOUTUBE API UNAVAILABLE
          </span>
          <span className="text-[var(--color-text-dim)] text-[10px] tracking-wider">
            Set YOUTUBE_API_KEY in .env to enable
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {list.map((v) => (
            <div key={v.id}>
              {playingId === v.id ? (
                <div className="mb-2">
                  <div
                    className="relative w-full rounded border border-[var(--color-cyan)] overflow-hidden"
                    style={{ aspectRatio: v.isShort ? "9/16" : "16/9", maxHeight: v.isShort ? 400 : undefined }}
                  >
                    <iframe
                      src={`https://www.youtube.com/embed/${v.id}?autoplay=1&modestbranding=1&rel=0`}
                      className="absolute inset-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={v.title}
                    />
                  </div>
                  <button
                    onClick={() => setPlayingId(null)}
                    className="mt-1 text-[10px] tracking-wider text-[var(--color-text-dim)] hover:text-[var(--color-cyan)] transition-colors cursor-pointer"
                  >
                    CLOSE PLAYER
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPlayingId(v.id)}
                  className="w-full flex gap-3 p-2 rounded border border-[var(--color-border)] hover:border-[rgba(0,212,255,0.3)] transition-all group text-left cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="relative shrink-0 w-28 rounded overflow-hidden" style={{ aspectRatio: "16/9" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0.5 right-0.5 px-1 py-px bg-black/80 rounded text-[9px] text-white tracking-wider">
                      {v.isShort ? "SHORT" : parseDurationDisplay(v.duration)}
                    </div>
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all">
                      <svg
                        className="w-6 h-6 text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow-lg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[var(--color-text)] leading-tight line-clamp-2 group-hover:text-[var(--color-cyan)] transition-colors">
                      {v.title}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-dim)] mt-1 tracking-wider">
                      {v.channelTitle}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--color-text-dim)]">
                      <span>{formatCount(v.viewCount)} views</span>
                      <span className="opacity-40">|</span>
                      <span>{formatCount(v.likeCount)} likes</span>
                    </div>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reddit Feed Panel ──

type RedditTab = "subreddits" | "global";

function RedditPanel() {
  const [subredditPosts, setSubredditPosts] = useState<RedditPost[]>([]);
  const [globalPosts, setGlobalPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RedditTab>("subreddits");

  useEffect(() => {
    fetch("/api/reddit")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSubredditPosts(data.subredditPosts ?? []);
          setGlobalPosts(data.globalPosts ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const posts = activeTab === "subreddits" ? subredditPosts : globalPosts;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader
          title="REDDIT FEED"
          count={posts.length}
        />
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("subreddits")}
            className={`px-2 py-0.5 text-[10px] tracking-wider border rounded transition-all ${
              activeTab === "subreddits"
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            }`}
          >
            MY SUBS
          </button>
          <button
            onClick={() => setActiveTab("global")}
            className={`px-2 py-0.5 text-[10px] tracking-wider border rounded transition-all ${
              activeTab === "global"
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] cursor-pointer"
            }`}
          >
            GLOBAL
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-dim)] text-xs tracking-wider">
          SCANNING REDDIT...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {posts.map((post, i) => (
            <a
              key={`${post.permalink}-${i}`}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-2 rounded border border-[var(--color-border)] hover:border-[rgba(0,212,255,0.3)] transition-all group"
            >
              {/* Score column */}
              <div className="shrink-0 w-10 flex flex-col items-center justify-center">
                <svg
                  className="w-3 h-3 text-[var(--color-amber)]"
                  viewBox="0 0 12 8"
                  fill="currentColor"
                >
                  <path d="M6 0L12 8H0z" />
                </svg>
                <span className="text-[11px] font-bold text-[var(--color-amber)] mt-0.5">
                  {formatCount(post.score)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-[var(--color-cyan)] tracking-wider">
                    {post.subreddit}
                  </span>
                  {post.linkFlair && (
                    <span className="text-[9px] px-1.5 py-px rounded bg-[rgba(0,212,255,0.08)] border border-[var(--color-border)] text-[var(--color-text-dim)] tracking-wider">
                      {post.linkFlair}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-text)] leading-tight line-clamp-2 group-hover:text-[var(--color-cyan)] transition-colors">
                  {post.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--color-text-dim)]">
                  <span>u/{post.author}</span>
                  <span className="opacity-40">|</span>
                  <span>{post.numComments} comments</span>
                  <span className="opacity-40">|</span>
                  <span>{timeAgo(post.createdUtc)}</span>
                  {post.domain && !post.domain.startsWith("self.") && (
                    <>
                      <span className="opacity-40">|</span>
                      <span className="text-[var(--color-text-dim)] opacity-60">
                        {post.domain}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Thumbnail */}
              {post.thumbnail && (
                <div className="shrink-0 w-16 h-16 rounded overflow-hidden border border-[var(--color-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RSS News Feed Panel ──

function RSSFeedPanel() {
  const [items, setItems] = useState<RssItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    fetch("/api/rss")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.items) setItems(data.items);
      })
      .finally(() => setLoading(false));
  }, []);

  // Build list of states that appear in current news, sorted by count
  const stateCounts = items.reduce<Record<string, number>>((acc, item) => {
    for (const s of item.matchedStates ?? []) {
      acc[s] = (acc[s] || 0) + 1;
    }
    return acc;
  }, {});
  const availableStates = Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const filtered = stateFilter
    ? items.filter((item) => item.matchedStates?.includes(stateFilter))
    : items;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="NEWS FEED" count={filtered.length} />
        {/* State filter */}
        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wider border rounded transition-all cursor-pointer ${
              stateFilter
                ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4 8h8M6 12h4" />
            </svg>
            {stateFilter ?? "ALL STATES"}
          </button>
          {showFilterDropdown && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowFilterDropdown(false)}
              />
              {/* Dropdown */}
              <div
                className="absolute right-0 top-full mt-1 z-20 w-48 max-h-64 overflow-y-auto rounded border border-[var(--color-border)] py-1"
                style={{ background: "rgba(13, 13, 20, 0.95)", backdropFilter: "blur(8px)" }}
              >
                <button
                  onClick={() => { setStateFilter(null); setShowFilterDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[10px] tracking-wider transition-colors cursor-pointer ${
                    !stateFilter
                      ? "text-[var(--color-cyan)] bg-[rgba(0,212,255,0.08)]"
                      : "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  ALL STATES
                  <span className="ml-1 opacity-50">({items.length})</span>
                </button>
                {availableStates.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => { setStateFilter(name); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[10px] tracking-wider transition-colors cursor-pointer ${
                      stateFilter === name
                        ? "text-[var(--color-cyan)] bg-[rgba(0,212,255,0.08)]"
                        : "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[rgba(255,255,255,0.03)]"
                    }`}
                  >
                    {name.toUpperCase()}
                    <span className="ml-1 opacity-50">({count})</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-[var(--color-text-dim)] text-xs tracking-wider">
          FETCHING NEWS FEEDS...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-1">
          <span className="text-[var(--color-amber)] text-xs tracking-wider">
            {stateFilter ? `NO NEWS FOR ${stateFilter.toUpperCase()}` : "NO NEWS AVAILABLE"}
          </span>
          <span className="text-[var(--color-text-dim)] text-[10px] tracking-wider">
            {stateFilter ? "Try selecting a different state" : "RSS feeds may be unreachable"}
          </span>
          {stateFilter && (
            <button
              onClick={() => setStateFilter(null)}
              className="mt-1 text-[10px] tracking-wider text-[var(--color-cyan)] hover:underline cursor-pointer"
            >
              SHOW ALL NEWS
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filtered.map((item, i) => (
            <a
              key={`${item.link}-${i}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 px-2.5 py-2 rounded border border-[var(--color-border)] hover:border-[rgba(0,212,255,0.3)] transition-all group"
            >
              {/* Source badge */}
              <div className="shrink-0 w-12 flex flex-col items-center justify-center">
                <span className="text-[8px] tracking-wider text-[var(--color-cyan)] font-bold text-center leading-tight uppercase">
                  {item.sourceName}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--color-text)] leading-tight line-clamp-2 group-hover:text-[var(--color-cyan)] transition-colors">
                  {item.title}
                </div>
                {item.description && (
                  <div className="text-[10px] text-[var(--color-text-dim)] mt-0.5 line-clamp-1 leading-tight">
                    {item.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--color-text-dim)] tracking-wider">
                  <span>{item.source}</span>
                  {item.pubDate && (
                    <>
                      <span className="opacity-40">|</span>
                      <span>{rssTimeAgo(item.pubDate)}</span>
                    </>
                  )}
                  {item.matchedStates?.length > 0 && (
                    <>
                      <span className="opacity-40">|</span>
                      {item.matchedStates.map((s) => (
                        <span
                          key={s}
                          className="px-1 py-px rounded bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.15)] text-[var(--color-cyan)] text-[8px] tracking-wider"
                        >
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Media View ──

export default function MediaView() {
  const [activeTab, setActiveTab] = useState<MediaTab>("live");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Mobile: tabbed single-panel view
  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div
          className="flex gap-1 px-3 py-2 shrink-0"
          style={{
            background: "rgba(13, 13, 20, 0.9)",
            borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1 text-[10px] tracking-wider border rounded transition-all ${
                activeTab === tab.key
                  ? "bg-[rgba(0,212,255,0.1)] border-[var(--color-cyan)] text-[var(--color-cyan)]"
                  : "border-[rgba(0,212,255,0.25)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden p-3">
          {activeTab === "live" && <LiveTVPanel compact />}
          {activeTab === "trending" && <TrendingPanel />}
          {activeTab === "reddit" && <RedditPanel />}
          {activeTab === "news" && <RSSFeedPanel />}
        </div>
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Live TV + RSS News Feed */}
      <div
        className="w-[45%] flex flex-col p-4 overflow-hidden"
        style={{ borderRight: "1px solid rgba(0, 212, 255, 0.1)" }}
      >
        <div className="shrink-0">
          <LiveTVPanel />
        </div>
        <div className="mt-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          <RSSFeedPanel />
        </div>
      </div>

      {/* Middle: Trending Videos */}
      <div
        className="w-[28%] flex flex-col p-4 overflow-hidden"
        style={{ borderRight: "1px solid rgba(0, 212, 255, 0.1)" }}
      >
        <TrendingPanel />
      </div>

      {/* Right: Reddit */}
      <div className="w-[27%] flex flex-col p-4 overflow-hidden">
        <RedditPanel />
      </div>
    </div>
  );
}

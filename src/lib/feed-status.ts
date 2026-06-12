import type { TickerData } from "@/lib/data/types";

export interface FeedStatus {
  ok: boolean;
  lastChange: number;
}

type Listener = () => void;

const statuses = new Map<string, FeedStatus>();
const listeners = new Set<Listener>();

let snapshot: ReadonlyMap<string, FeedStatus> = new Map();

export function reportFeedStatus(feed: string, ok: boolean): void {
  const prev = statuses.get(feed);
  if (prev && prev.ok === ok) return;
  statuses.set(feed, { ok, lastChange: Date.now() });
  snapshot = new Map(statuses);
  for (const cb of listeners) cb();
}

export function subscribeFeedStatus(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getFeedStatuses(): ReadonlyMap<string, FeedStatus> {
  return snapshot;
}

// Shared /api/ticker fetch — dedupes concurrent requests and serves a short-lived
// cache so multiple consumers (news ticker, mobile rates bar) trigger one fetch.
const TICKER_FRESH_MS = 30_000;

let tickerPromise: Promise<TickerData> | null = null;
let tickerCache: { data: TickerData; at: number } | null = null;

export function fetchTickerData(force = false): Promise<TickerData> {
  if (!force && tickerCache && Date.now() - tickerCache.at < TICKER_FRESH_MS) {
    return Promise.resolve(tickerCache.data);
  }
  if (!tickerPromise) {
    tickerPromise = fetch("/api/ticker")
      .then(async (res) => {
        if (!res.ok) throw new Error(`ticker fetch failed: ${res.status}`);
        const data = (await res.json()) as TickerData;
        tickerCache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        tickerPromise = null;
      });
  }
  return tickerPromise;
}

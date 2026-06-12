import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Shared edge-cache helpers backed by the Cloudflare Cache API.
 *
 * On Cloudflare Workers, `Cache-Control` response headers do NOT populate a
 * shared edge cache for dynamic routes, in-memory module caches are
 * per-isolate, and `next: { revalidate }` is a no-op (no incremental cache is
 * configured). Explicit `caches.default` usage is the only way to share
 * results across isolates without extra bindings.
 *
 * In `next dev` (Node) there is no `caches.default`, so these helpers fall
 * back to a small per-process Map cache.
 */

const devCache = new Map<string, { body: string; expires: number }>();
const DEV_CACHE_MAX_ENTRIES = 256;
const isTest = !!process.env.VITEST;

function getEdgeCache(): Cache | null {
  const cs = (globalThis as { caches?: { default?: Cache } }).caches;
  if (cs && typeof cs === "object" && "default" in cs && cs.default) {
    return cs.default;
  }
  return null;
}

function keyRequest(key: string): Request {
  return new Request(`https://edge-cache.internal/${encodeURIComponent(key)}`);
}

/** Keep a promise alive past the response via ctx.waitUntil when available. */
export function runInBackground(promise: Promise<unknown>): void {
  const safe = promise.catch(() => {});
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(safe);
  } catch {
    // No Cloudflare context (next dev / build) — fire and forget.
  }
}

export async function edgeGet<T>(key: string): Promise<T | undefined> {
  const cache = getEdgeCache();
  if (cache) {
    try {
      const hit = await cache.match(keyRequest(key));
      if (hit) return (await hit.json()) as T;
    } catch {
      // Treat cache errors as misses.
    }
    return undefined;
  }

  if (isTest) return undefined;
  const entry = devCache.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    devCache.delete(key);
    return undefined;
  }
  return JSON.parse(entry.body) as T;
}

export async function edgePut(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const body = JSON.stringify(value);
  const cache = getEdgeCache();
  if (cache) {
    const res = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttlSeconds}`,
      },
    });
    try {
      await cache.put(keyRequest(key), res);
    } catch {
      // Best effort — never fail the request over a cache write.
    }
    return;
  }

  if (isTest) return;
  if (devCache.size >= DEV_CACHE_MAX_ENTRIES) {
    const oldest = devCache.keys().next().value;
    if (oldest !== undefined) devCache.delete(oldest);
  }
  devCache.set(key, { body, expires: Date.now() + ttlSeconds * 1000 });
}

export async function edgeDelete(key: string): Promise<void> {
  const cache = getEdgeCache();
  if (cache) {
    try {
      await cache.delete(keyRequest(key));
    } catch {
      // Best effort.
    }
    return;
  }
  devCache.delete(key);
}

/**
 * Read-through JSON cache. On a miss the fetcher runs, its result is stored
 * for `ttlSeconds` (write happens via ctx.waitUntil so it doesn't delay the
 * response), and the fresh value is returned. Fetcher errors propagate and
 * are never cached.
 */
export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = await edgeGet<T>(key);
  if (hit !== undefined) return hit;

  const value = await fetcher();
  runInBackground(edgePut(key, value, ttlSeconds));
  return value;
}

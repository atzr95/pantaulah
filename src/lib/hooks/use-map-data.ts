"use client";

import { useEffect, useState } from "react";

/** Poll only while a map layer is enabled; never turn source errors into an empty success. */
export function useMapData<T>(url: string | null, interval = 300_000) {
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    fetchedAt: string | null;
    error: string | null;
  }>({ url: "", data: null, fetchedAt: null, error: null });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
          throw new Error("Data unavailable. Try again shortly.");
        const body = (await response.json()) as { data: T; fetchedAt: string };
        if (!controller.signal.aborted)
          setResult({
            url,
            data: body.data,
            fetchedAt: body.fetchedAt,
            error: null,
          });
      } catch (e) {
        if (!controller.signal.aborted)
          setResult({
            url,
            data: null,
            fetchedAt: null,
            error: e instanceof Error ? e.message : "Data unavailable",
          });
      }
    };
    void load();
    const timer = setInterval(load, interval);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [url, interval]);
  return result.url === url
    ? result
    : { data: null, fetchedAt: null, error: null };
}

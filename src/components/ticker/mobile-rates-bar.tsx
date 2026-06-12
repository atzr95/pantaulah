"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TickerData } from "@/lib/data/types";
import { fetchTickerData, reportFeedStatus } from "@/lib/feed-status";
import { formatRate } from "@/lib/utils/format";

const RETRY_MS = 90 * 1000;

export default function MobileRatesBar() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [failed, setFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRates = useCallback(async (force = false) => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    try {
      const data = await fetchTickerData(force);
      setTickerData(data);
      setFailed(false);
      reportFeedStatus("rates", true);
    } catch {
      setFailed(true);
      reportFeedStatus("rates", false);
      retryTimer.current = setTimeout(() => loadRates(true), RETRY_MS);
    }
  }, []);

  useEffect(() => {
    loadRates();
    const interval = setInterval(() => loadRates(true), 60 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [loadRates]);

  const rates = tickerData?.rates ?? [];
  const opr = tickerData?.opr;
  const fuel = tickerData?.fuel;
  const gold = tickerData?.gold;

  if (!tickerData && !failed) return null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 overflow-x-auto scrollbar-none text-[10px] shrink-0"
      style={{
        background: "linear-gradient(180deg, #0d0d14 0%, #111118 100%)",
        borderTop: "1px solid rgba(0, 212, 255, 0.08)",
      }}
    >
      {!tickerData && (
        <span className="whitespace-nowrap shrink-0 tracking-wider text-[var(--color-text-dim)]">
          RATES UNAVAILABLE
        </span>
      )}
      {rates.slice(0, 2).map((r) => (
        <span key={r.currency} className="whitespace-nowrap shrink-0">
          <span className="text-[var(--color-text-dim)]">{r.currency}</span>
          <span className="text-[var(--color-text-bright)] ml-1">
            {formatRate(r.rate)}
          </span>
        </span>
      ))}
      {opr != null && (
        <span className="whitespace-nowrap shrink-0">
          <span className="text-[var(--color-text-dim)]">OPR</span>
          <span className="text-[var(--color-text-bright)] ml-1">{opr}%</span>
        </span>
      )}
      {gold && (
        <span className="whitespace-nowrap shrink-0">
          <span className="text-[var(--color-text-dim)]">GOLD 999</span>
          <span className="text-[var(--color-text-bright)] ml-1">
            RM{gold.gold999.toFixed(2)}/g
          </span>
        </span>
      )}
      {fuel && (
        <span className="whitespace-nowrap shrink-0">
          <span className="text-[var(--color-text-dim)]">RON95</span>
          <span className="text-[var(--color-text-bright)] ml-1">
            RM{fuel.ron95.toFixed(2)}
          </span>
        </span>
      )}
    </div>
  );
}

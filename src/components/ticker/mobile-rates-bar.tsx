"use client";

import { useEffect, useState } from "react";
import type { TickerData } from "@/lib/data/types";
import { formatRate } from "@/lib/utils/format";

export default function MobileRatesBar() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);

  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch("/api/ticker");
        if (res.ok) setTickerData(await res.json());
      } catch {
        // silent
      }
    };
    fetchTicker();
    const interval = setInterval(fetchTicker, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const rates = tickerData?.rates ?? [];
  const opr = tickerData?.opr;
  const fuel = tickerData?.fuel;
  const gold = tickerData?.gold;

  if (!tickerData) return null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 overflow-x-auto scrollbar-none text-[10px] shrink-0"
      style={{
        background: "linear-gradient(180deg, #0d0d14 0%, #111118 100%)",
        borderTop: "1px solid rgba(0, 212, 255, 0.08)",
      }}
    >
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

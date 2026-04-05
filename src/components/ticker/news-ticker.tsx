"use client";

import { useEffect, useState } from "react";
import type { TickerData } from "@/lib/data/types";
import { formatRate } from "@/lib/utils/format";

export default function NewsTicker() {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);

  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch("/api/ticker");
        if (res.ok) {
          const data = await res.json();
          setTickerData(data);
        }
      } catch {
        // Silently fail, ticker shows placeholder
      }
    };
    fetchTicker();
    const interval = setInterval(fetchTicker, 60 * 60 * 1000); // Refresh hourly
    return () => clearInterval(interval);
  }, []);

  const headlines = tickerData?.headlines ?? [];
  const rates = tickerData?.rates ?? [];
  const opr = tickerData?.opr;
  const fuel = tickerData?.fuel;
  const gold = tickerData?.gold;

  // Double the headlines for seamless loop
  const scrollContent = [...headlines, ...headlines];

  return (
    <div
      className="h-11 flex items-center px-5 gap-3 shrink-0 relative z-20"
      style={{
        background: "linear-gradient(180deg, #0d0d14 0%, #111118 100%)",
        borderTop: "1px solid rgba(0, 212, 255, 0.1)",
      }}
    >
      <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)] whitespace-nowrap shrink-0 pr-3 border-r border-[var(--color-border)]">
        LIVE FEED
      </div>

      <div className="flex-1 overflow-hidden whitespace-nowrap">
        {headlines.length > 0 ? (
          <div className="ticker-animate inline-block">
            {scrollContent.map((h, i) => (
              <span key={i} className="text-[11px] text-[var(--color-text-muted)]">
                {h.title}
                <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
                  [{h.source}]
                </span>
                <span className="text-[rgba(0,212,255,0.3)] mx-5">///</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            Loading headlines...
          </span>
        )}
      </div>

      <div className="flex gap-4 shrink-0 pl-3 border-l border-[var(--color-border)] text-[10px]">
        <span className="relative group/rates flex gap-4 cursor-default">
          {rates.slice(0, 2).map((r) => (
            <span key={r.currency}>
              <span className="text-[var(--color-text-muted)]">{r.currency}/MYR</span>
              <span className="text-[var(--color-text-bright)] ml-1">
                {formatRate(r.rate)}
              </span>
            </span>
          ))}
          {opr != null && (
            <span>
              <span className="text-[var(--color-text-muted)]">OPR</span>
              <span className="text-[var(--color-text-bright)] ml-1">{opr}%</span>
            </span>
          )}
          {rates.length > 2 && (
            <div
              className="absolute bottom-full right-0 mb-2 hidden group-hover/rates:block z-50"
              style={{
                background: "linear-gradient(180deg, #16161e 0%, #111118 100%)",
                border: "1px solid rgba(0, 212, 255, 0.15)",
                borderRadius: "4px",
                padding: "8px 12px",
                minWidth: "160px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)] mb-2">
                EXCHANGE RATES
              </div>
              <div className="flex flex-col gap-1.5">
                {rates.map((r) => (
                  <div key={r.currency} className="flex justify-between gap-4">
                    <span className="text-[var(--color-text-muted)]">{r.currency}/MYR</span>
                    <span className="text-[var(--color-text-bright)]">{formatRate(r.rate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </span>
        {gold && (
          <span className="relative group/gold cursor-default">
            <span className="text-[var(--color-text-muted)]">GOLD</span>
            <span className="text-[var(--color-text-bright)] ml-1">RM{gold.gold999.toFixed(2)}/g</span>
            <div
              className="absolute bottom-full right-0 mb-2 hidden group-hover/gold:block z-50"
              style={{
                background: "linear-gradient(180deg, #16161e 0%, #111118 100%)",
                border: "1px solid rgba(0, 212, 255, 0.15)",
                borderRadius: "4px",
                padding: "8px 12px",
                minWidth: "160px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)] mb-2">
                GOLD PRICE / GRAM
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--color-text-muted)]">999</span>
                  <span className="text-[var(--color-text-bright)]">RM{gold.gold999.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--color-text-muted)]">916</span>
                  <span className="text-[var(--color-text-bright)]">RM{gold.gold916.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-[10px] text-[var(--color-text-dim)] mt-2 tracking-wider">
                SRC: BNM KIJANG EMAS
              </div>
              <div className="text-[10px] text-[var(--color-text-dim)] tracking-wider">
                EFF. {gold.effectiveDate}
              </div>
            </div>
          </span>
        )}
        {fuel && (
          <span className="relative group/fuel cursor-default">
            <span className="text-[var(--color-text-muted)]">RON95</span>
            <span className="text-[var(--color-text-bright)] ml-1">RM{fuel.ron95.toFixed(2)}</span>
            <div
              className="absolute bottom-full right-0 mb-2 hidden group-hover/fuel:block z-50"
              style={{
                background: "linear-gradient(180deg, #16161e 0%, #111118 100%)",
                border: "1px solid rgba(0, 212, 255, 0.15)",
                borderRadius: "4px",
                padding: "8px 12px",
                minWidth: "140px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)] mb-2">
                FUEL PRICES
              </div>
              <div className="flex flex-col gap-1.5">
                {([["RON95", fuel.ron95], ["RON97", fuel.ron97], ["DIESEL", fuel.diesel]] as const).map(([label, price]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-[var(--color-text-muted)]">{label}</span>
                    <span className="text-[var(--color-text-bright)]">RM{price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {(fuel.ron95Budi != null || fuel.dieselEastMsia != null) && (
                <>
                  <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)] mt-3 mb-2">
                    SUBSIDISED
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {fuel.ron95Budi != null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[var(--color-text-muted)]">RON95 (BUDI)</span>
                        <span className="text-[var(--color-text-bright)]">RM{fuel.ron95Budi.toFixed(2)}</span>
                      </div>
                    )}
                    {fuel.dieselEastMsia != null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-[var(--color-text-muted)]">DIESEL (E.MSIA)</span>
                        <span className="text-[var(--color-text-bright)]">RM{fuel.dieselEastMsia.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="text-[10px] text-[var(--color-text-dim)] mt-2 tracking-wider">
                EFF. {fuel.date}
              </div>
            </div>
          </span>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useRef } from "react";

interface Highway {
  code: string;
  route: string;
  name: string;
}

const HIGHWAY_GROUPS: Record<string, { label: string; highways: Highway[] }> = {
  PLUS: {
    label: "PLUS Expressway",
    highways: [
      { code: "PLS", route: "E1", name: "PLUS Utara (North)" },
      { code: "SPL", route: "E2", name: "PLUS Selatan (South)" },
      { code: "NKV", route: "E1", name: "NKVE" },
      { code: "ELT", route: "E6", name: "ELITE" },
    ],
  },
  "East Coast": {
    label: "East Coast",
    highways: [
      { code: "KLK", route: "E8", name: "KL-Karak" },
      { code: "LPT", route: "E8", name: "LPT1 (East Coast)" },
    ],
  },
  "KL Urban": {
    label: "KL Urban Highways",
    highways: [
      { code: "KSS", route: "E5", name: "KESAS" },
      { code: "LDP", route: "E11", name: "LDP (Damansara-Puchong)" },
      { code: "DUKE", route: "E33", name: "DUKE" },
      { code: "DASH", route: "E31", name: "DASH" },
      { code: "SUKE", route: "E19", name: "SUKE" },
      { code: "NPE", route: "E10", name: "NPE (New Pantai)" },
      { code: "BES", route: "E9", name: "BESRAYA" },
      { code: "SRT", route: "E23", name: "SPRINT" },
      { code: "AKL", route: "E12", name: "AKLEH (Ampang)" },
      { code: "CKH", route: "E7", name: "GRANDSAGA (Cheras-Kajang)" },
    ],
  },
  Other: {
    label: "Other Highways",
    highways: [
      { code: "WCE", route: "E32", name: "WCE (West Coast)" },
      { code: "GCE", route: "E35", name: "Guthrie Corridor" },
      { code: "SDE", route: "E22", name: "Senai-Desaru" },
      { code: "LKS", route: "E21", name: "LEKAS (Kajang-Seremban)" },
      { code: "PNB", route: "E36", name: "Penang Bridge" },
      { code: "SMT", route: "E38", name: "SMART Tunnel" },
      { code: "JKSB", route: "E28", name: "Penang 2nd Bridge" },
    ],
  },
};

const isProduction = typeof window !== "undefined" && !window.location.hostname.includes("localhost");

export default function CCTVViewer() {
  const [expanded, setExpanded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedHighway, setSelectedHighway] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadCameras = useCallback(async (code: string) => {
    if (selectedHighway === code) {
      setSelectedHighway(null);
      setIframeUrl(null);
      return;
    }
    setSelectedHighway(code);
    setIframeUrl(null);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/cctv?h=${code}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.iframeUrl) {
          setIframeUrl(data.iframeUrl);
        } else {
          setFetchError("No URL returned");
        }
      } else {
        setFetchError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setFetchError(String(err));
    }
    setLoading(false);
  }, [selectedHighway]);

  const refreshCameras = useCallback(async () => {
    if (!selectedHighway || loading || refreshCooldown) return;
    setIframeUrl(null);
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/cctv?h=${selectedHighway}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.iframeUrl) setIframeUrl(data.iframeUrl);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
    setRefreshCooldown(true);
    clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setRefreshCooldown(false), 10_000);
  }, [selectedHighway, loading, refreshCooldown]);

  const refreshDisabled = loading || refreshCooldown;

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        className="w-full px-4 py-2.5 flex justify-between items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-[10px] tracking-[2px] text-[var(--color-cyan)]">
          HIGHWAY CCTV
          <span className="text-[var(--color-text-dim)] ml-2">/ LIVE</span>
        </div>
        <span className="text-[10px] text-[var(--color-text-dim)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && isProduction && (
        <div className="px-3 pb-3 text-center">
          <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] py-3">
            CCTV FEEDS UNAVAILABLE IN PRODUCTION
          </div>
          <div className="text-[8px] text-[var(--color-text-dim)] opacity-50">
            LLM.gov.my restricts access from cloud servers.
            <br />
            Available on localhost only.
          </div>
        </div>
      )}

      {expanded && !isProduction && (
        <div className="px-3 pb-3">
          {/* Step 1: Choose highway group */}
          {!selectedGroup && (
            <div className="space-y-1.5">
              {Object.entries(HIGHWAY_GROUPS).map(([key, group]) => (
                <button
                  key={key}
                  onClick={() => setSelectedGroup(key)}
                  className="w-full flex justify-between items-center px-3 py-2 text-[10px] tracking-wider border border-[rgba(0,212,255,0.15)] rounded hover:border-[rgba(0,212,255,0.3)] hover:text-[var(--color-text)] text-[var(--color-text-muted)] transition-all"
                >
                  <span>{group.label}</span>
                  <span className="text-[var(--color-text-dim)]">{group.highways.length} highways ▸</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Choose specific highway */}
          {selectedGroup && !selectedHighway && (
            <div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="text-[10px] tracking-wider text-[var(--color-cyan)] mb-2 cursor-pointer hover:underline"
              >
                ◂ BACK
              </button>
              <div className="text-[10px] tracking-[2px] text-[var(--color-text-dim)] mb-1.5">
                {HIGHWAY_GROUPS[selectedGroup].label.toUpperCase()}
              </div>
              <div className="space-y-1">
                {HIGHWAY_GROUPS[selectedGroup].highways.map((h) => (
                  <button
                    key={h.code}
                    onClick={() => loadCameras(h.code)}
                    className="w-full flex justify-between items-center px-3 py-1.5 text-[10px] tracking-wider border border-[rgba(0,212,255,0.15)] rounded hover:border-[rgba(0,212,255,0.3)] hover:text-[var(--color-text)] text-[var(--color-text-muted)] transition-all"
                  >
                    <span>{h.name}</span>
                    <span className="text-[var(--color-text-dim)]">{h.route}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Show cameras via iframe */}
          {selectedHighway && (
            <div>
              <button
                onClick={() => { setSelectedHighway(null); setIframeUrl(null); }}
                className="text-[10px] tracking-wider text-[var(--color-cyan)] mb-2 cursor-pointer hover:underline"
              >
                ◂ BACK TO HIGHWAYS
              </button>

              {loading && (
                <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] py-4 text-center">
                  LOADING CAMERAS...
                </div>
              )}

              {!loading && !iframeUrl && (
                <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] py-2 text-center">
                  CAMERAS UNAVAILABLE
                  {fetchError && (
                    <div className="mt-1 text-[8px] text-[var(--color-amber)] break-all px-2">
                      {fetchError}
                    </div>
                  )}
                </div>
              )}

              {iframeUrl && (
                <>
                  <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] mb-1.5 flex items-center justify-between">
                    <span>LIVE FEED · SCROLL TO VIEW ALL</span>
                    <button
                      onClick={refreshCameras}
                      disabled={refreshDisabled}
                      className="text-[10px] tracking-wider text-[var(--color-cyan)] hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      {loading ? "REFRESHING..." : refreshCooldown ? "WAIT..." : "REFRESH ↻"}
                    </button>
                  </div>
                  <div
                    className="rounded border border-[rgba(0,212,255,0.15)] overflow-hidden"
                    style={{ background: "#000" }}
                  >
                    <iframe
                      src={iframeUrl}
                      title="Highway CCTV"
                      className="w-full border-0"
                      style={{ height: "500px" }}
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                  <div className="text-[8px] tracking-wider text-[var(--color-text-dim)] mt-1 text-center opacity-50">
                    SOURCE: LLM.GOV.MY · IMAGES LOADED DIRECTLY FROM YOUR DEVICE
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

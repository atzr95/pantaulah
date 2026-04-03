"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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

interface Camera {
  name: string;
  image: string;
}

function CameraImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div style={style} className="bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-[8px] text-[var(--color-text-dim)] tracking-wider">
        FEED OFFLINE
      </div>
    );
  }

  return (
    <div ref={ref} style={style}>
      {visible ? (
        <img
          src={src}
          alt={alt}
          className={className}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-[8px] text-[var(--color-text-dim)] tracking-wider">
          LOADING...
        </div>
      )}
    </div>
  );
}

// Mobile gets 8 cameras per batch to keep payload under ~4MB
const MOBILE_LIMIT = 4;
function isMobileDevice() {
  return typeof window !== "undefined" && window.innerWidth < 1024;
}

export default function CCTVViewer() {
  const [expanded, setExpanded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedHighway, setSelectedHighway] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [totalCameras, setTotalCameras] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fullscreenImg, setFullscreenImg] = useState<Camera | null>(null);
  const [zoom, setZoom] = useState(1);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCameras = useCallback(async (code: string, limit?: number) => {
    setLoading(true);
    try {
      const mobile = isMobileDevice();
      const fetchLimit = limit ?? (mobile ? MOBILE_LIMIT : undefined);
      const url = fetchLimit ? `/api/cctv?h=${code}&limit=${fetchLimit}` : `/api/cctv?h=${code}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCameras(data.cameras || []);
        setTotalCameras(data.total || data.cameras?.length || 0);
        return data.cameras || [];
      }
    } catch {
      // silently fail
    }
    setLoading(false);
    return null;
  }, []);

  const loadMoreCameras = useCallback(async () => {
    if (!selectedHighway || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextLimit = cameras.length + MOBILE_LIMIT;
      const url = `/api/cctv?h=${selectedHighway}&limit=${nextLimit}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCameras(data.cameras || []);
        setTotalCameras(data.total || data.cameras?.length || 0);
      }
    } catch {
      // silently fail
    }
    setLoadingMore(false);
  }, [selectedHighway, cameras.length, loadingMore]);

  const loadCameras = useCallback(async (code: string) => {
    if (selectedHighway === code) {
      setSelectedHighway(null);
      setCameras([]);
      setTotalCameras(0);
      return;
    }
    setSelectedHighway(code);
    setCameras([]);
    setTotalCameras(0);
    const cams = await fetchCameras(code);
    if (cams) setLoading(false);
  }, [selectedHighway, fetchCameras]);

  const refreshCameras = useCallback(async () => {
    if (!selectedHighway || loading || refreshCooldown) return;
    const cams = await fetchCameras(selectedHighway, cameras.length);
    if (cams && fullscreenImg) {
      const updated = cams.find((c: Camera) => c.name === fullscreenImg.name);
      if (updated) setFullscreenImg(updated);
    }
    setLoading(false);
    // 10s cooldown after refresh completes
    setRefreshCooldown(true);
    clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setRefreshCooldown(false), 10_000);
  }, [selectedHighway, fetchCameras, fullscreenImg, loading, refreshCooldown]);

  const refreshDisabled = loading || refreshCooldown;

  return (
    <>
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

        {expanded && (
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

            {/* Step 3: Show cameras */}
            {selectedHighway && (
              <div>
                <button
                  onClick={() => { setSelectedHighway(null); setCameras([]); }}
                  className="text-[10px] tracking-wider text-[var(--color-cyan)] mb-2 cursor-pointer hover:underline"
                >
                  ◂ BACK TO HIGHWAYS
                </button>

                {loading && (
                  <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] py-4 text-center">
                    LOADING CAMERAS...
                  </div>
                )}

                {!loading && cameras.length === 0 && (
                  <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] py-2 text-center">
                    NO CAMERAS AVAILABLE
                  </div>
                )}

                {cameras.length > 0 && (
                  <>
                    <div className="text-[10px] tracking-wider text-[var(--color-text-dim)] mb-1.5 flex items-center justify-between">
                      <span>{cameras.length}{totalCameras > cameras.length ? `/${totalCameras}` : ""} CAMERAS · TAP TO ENLARGE</span>
                      <button
                        onClick={refreshCameras}
                        disabled={refreshDisabled}
                        className="text-[10px] tracking-wider text-[var(--color-cyan)] hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        {loading ? "REFRESHING..." : refreshCooldown ? "WAIT..." : "REFRESH ↻"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[400px] overflow-y-auto">
                      {cameras.map((cam, i) => {
                        const shortName = cam.name
                          .replace(/^[A-Z]+-CAM-[A-Z0-9]+-/, "")
                          .replace(/-/g, " ");
                        return (
                          <button
                            key={i}
                            className="relative text-left cursor-pointer"
                            onClick={() => setFullscreenImg(cam)}
                          >
                            <CameraImage
                              src={cam.image}
                              alt={cam.name}
                              className="w-full rounded-sm border border-[rgba(255,255,255,0.08)] hover:border-[rgba(0,212,255,0.3)] transition-all"
                              style={{ aspectRatio: "16/9" }}
                            />
                            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[7px] tracking-wider text-white bg-[rgba(0,0,0,0.7)]">
                              {shortName}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {totalCameras > cameras.length && (
                      <button
                        onClick={loadMoreCameras}
                        disabled={loadingMore}
                        className="w-full mt-2 py-2 text-[10px] tracking-wider border border-[rgba(0,212,255,0.25)] rounded text-[var(--color-cyan)] hover:border-[rgba(0,212,255,0.5)] transition-all disabled:opacity-40"
                      >
                        {loadingMore ? "LOADING..." : `LOAD MORE (${totalCameras - cameras.length} remaining)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen image overlay with scroll-to-zoom */}
      {fullscreenImg && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.9)]"
          onClick={(e) => {
            if (e.target === e.currentTarget) { setFullscreenImg(null); setZoom(1); }
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.min(5, Math.max(1, z + (e.deltaY > 0 ? -0.3 : 0.3))));
          }}
        >
          <div className="relative" style={{ cursor: zoom > 1 ? "move" : "pointer" }}>
            <img
              src={fullscreenImg.image}
              alt={fullscreenImg.name}
              className="rounded border border-[rgba(255,255,255,0.1)] transition-all duration-150"
              style={{
                width: `${zoom * 70}vw`,
                maxWidth: `${zoom * 70}vw`,
                height: "auto",
              }}
              draggable={false}
            />
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 text-[11px] tracking-wider text-white bg-[rgba(0,0,0,0.7)] rounded-b flex justify-between items-center">
              <span>{fullscreenImg.name.replace(/^[A-Z]+-CAM-[A-Z0-9]+-/, "").replace(/-/g, " ")}</span>
              {zoom > 1 && (
                <span className="text-[10px] text-[var(--color-text-dim)]">{zoom.toFixed(1)}x · scroll to zoom</span>
              )}
            </div>
            <button
              className="absolute top-2 right-12 w-8 h-8 flex items-center justify-center rounded-full bg-[rgba(0,0,0,0.6)] text-white text-sm hover:bg-[rgba(0,0,0,0.8)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={refreshCameras}
              disabled={refreshDisabled}
              title={refreshDisabled ? "Please wait..." : "Refresh"}
            >
              ↻
            </button>
            <button
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-[rgba(0,0,0,0.6)] text-white text-lg hover:bg-[rgba(0,0,0,0.8)]"
              onClick={() => { setFullscreenImg(null); setZoom(1); }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

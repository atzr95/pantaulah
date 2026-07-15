"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { RadarImageSet } from "@/lib/data/weather-types";

type ImageType = "radar" | "satellite" | "swirl";

const IMAGE_CONFIG: Array<{ key: ImageType; label: string; description: string }> = [
  {
    key: "radar",
    label: "RADAR",
    description: "Composite radar echo showing precipitation intensity",
  },
  {
    key: "satellite",
    label: "SATELLITE",
    description: "Latest infrared satellite imagery",
  },
  {
    key: "swirl",
    label: "SWIRL",
    description: "Short-range Weather Intensity Radar Loop — 3hr nowcast",
  },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

/** Fullscreen zoomable image viewer for mobile */
function ZoomViewer({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);
  const lastTouchRef = useRef<{ dist: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // ponytail: pan clamp uses the viewport as the image bounds (viewer is fullscreen,
  // image is object-contain) — close enough to keep the image from flying off-screen
  const apply = useCallback((next: { scale: number; x: number; y: number }) => {
    const maxX = ((next.scale - 1) * window.innerWidth) / 2;
    const maxY = ((next.scale - 1) * window.innerHeight) / 2;
    const clamped = {
      scale: next.scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
    transformRef.current = clamped;
    setTransform(clamped);
  }, []);

  const reset = useCallback(() => apply({ scale: 1, x: 0, y: 0 }), [apply]);

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const startPan = useCallback((touch: { clientX: number; clientY: number }) => {
    panRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      origX: transformRef.current.x,
      origY: transformRef.current.y,
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      lastTouchRef.current = { dist: getTouchDist(e.touches) };
      panRef.current = null;
    } else if (e.touches.length === 1 && transformRef.current.scale > 1) {
      // Pan start (only when zoomed)
      startPan(e.touches[0]);
      lastTouchRef.current = null;
    }
  }, [startPan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchRef.current) {
      // Pinch zoom — scale the pan with it so zooming out re-centers the image
      const dist = getTouchDist(e.touches);
      const ratio = dist / lastTouchRef.current.dist;
      lastTouchRef.current.dist = dist;
      const t = transformRef.current;
      const nextScale = Math.max(1, Math.min(5, t.scale * ratio));
      const applied = nextScale / t.scale;
      apply({ scale: nextScale, x: t.x * applied, y: t.y * applied });
    } else if (e.touches.length === 1 && panRef.current) {
      // Pan
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      const t = transformRef.current;
      apply({ scale: t.scale, x: panRef.current.origX + dx, y: panRef.current.origY + dy });
    }
  }, [apply]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchRef.current = null;
    // Lifting one finger of a pinch: hand off to panning with the remaining finger
    if (e.touches.length === 1 && transformRef.current.scale > 1) {
      startPan(e.touches[0]);
    } else {
      panRef.current = null;
    }
  }, [startPan]);

  // Double-tap to toggle zoom
  const lastTapRef = useRef(0);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap
      if (transformRef.current.scale > 1) {
        reset();
      } else {
        apply({ scale: 2.5, x: 0, y: 0 });
      }
    }
    lastTapRef.current = now;
  }, [apply, reset]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(5, 5, 10, 0.97)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-[10px] tracking-[2px] text-[var(--color-text-dim)]">
          PINCH TO ZOOM · DOUBLE-TAP TO RESET
        </span>
        <div className="flex items-center gap-3">
          {transform.scale > 1 && (
            <button
              onClick={reset}
              className="text-[10px] tracking-[1.5px] text-[var(--color-cyan)] border border-[rgba(0,212,255,0.3)] rounded px-2.5 py-1"
            >
              RESET
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Zoomable image */}
      <div
        className="flex-1 overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: transform.scale === 1 ? "transform 0.2s ease" : "none",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

interface RadarPanelProps {
  radar: RadarImageSet;
}

export default function RadarPanel({ radar }: RadarPanelProps) {
  const [activeImage, setActiveImage] = useState<ImageType>("radar");
  const [imageError, setImageError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const isMobile = useIsMobile();

  const currentConfig = IMAGE_CONFIG.find((c) => c.key === activeImage)!;
  const imageUrl = radar[activeImage];

  return (
    <div className="flex flex-col h-full">
      {/* Image type selector */}
      <div className="flex items-center gap-1.5 px-3 lg:px-5 py-2 lg:py-3 border-b border-[var(--color-border)]">
        {IMAGE_CONFIG.map((config) => (
          <button
            key={config.key}
            onClick={() => {
              setActiveImage(config.key);
              setImageError(false);
            }}
            className={`px-2 lg:px-3 py-1 text-[10px] lg:text-[10px] tracking-wider border rounded transition-all ${
              activeImage === config.key
                ? "bg-[rgba(0,212,255,0.12)] border-[var(--color-cyan)] text-[var(--color-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                : "border-[rgba(0,212,255,0.2)] text-[var(--color-text-muted)] hover:border-[rgba(0,212,255,0.4)] hover:text-[var(--color-text)] bg-[rgba(10,10,15,0.7)]"
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Image display */}
      {/* Desktop: absolute fill; Mobile: scrollable with natural image sizing */}
      <div
        className="flex-1 relative overflow-hidden lg:block hidden"
        style={{ background: "rgba(13, 13, 20, 0.8)" }}
      >
        {imageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[var(--color-text-dim)] text-sm mb-2">
              IMAGE UNAVAILABLE
            </div>
            <div className="text-[10px] text-[var(--color-text-dim)]">
              MetMalaysia image endpoint may be temporarily down
            </div>
            <div className="text-[10px] text-[var(--color-text-dim)] mt-2 font-mono opacity-50">
              {imageUrl}
            </div>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`MetMalaysia ${currentConfig.label}`}
            className="absolute inset-0 w-full h-full object-contain"
            onError={() => setImageError(true)}
          />
        )}

        {/* Overlay scanline effect */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.02) 2px, rgba(0,212,255,0.02) 4px)",
          }}
        />

        {/* Corner decorations */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t border-l border-[var(--color-cyan)] opacity-40" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t border-r border-[var(--color-cyan)] opacity-40" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b border-l border-[var(--color-cyan)] opacity-40" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b border-r border-[var(--color-cyan)] opacity-40" />

        {/* Description overlay */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] tracking-[2px] text-[var(--color-text-dim)] bg-[rgba(10,10,15,0.7)] px-3 py-1 rounded backdrop-blur-sm text-center">
          {currentConfig.description.toUpperCase()}
        </div>

        {/* Updated time overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-[var(--color-text-dim)] bg-[rgba(10,10,15,0.7)] px-3 py-1 rounded backdrop-blur-sm">
          UPDATED: {new Date(radar.updatedAt).toLocaleTimeString("en-MY", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          MYT
        </div>
      </div>

      {/* Mobile: scrollable layout */}
      <div
        className="flex-1 overflow-y-auto lg:hidden"
        style={{ background: "rgba(13, 13, 20, 0.8)" }}
      >
        {/* Description */}
        <div className="text-center text-[10px] tracking-[2px] text-[var(--color-text-dim)] px-3 py-2">
          {currentConfig.description.toUpperCase()}
        </div>

        {imageError ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-[var(--color-text-dim)] text-sm mb-2">
              IMAGE UNAVAILABLE
            </div>
            <div className="text-[10px] text-[var(--color-text-dim)]">
              MetMalaysia image endpoint may be temporarily down
            </div>
          </div>
        ) : (
          <div
            className="relative px-2"
            onClick={() => !imageError && setZoomOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`MetMalaysia ${currentConfig.label}`}
              className="w-full h-auto rounded"
              onError={() => setImageError(true)}
            />
            {/* Corner decorations */}
            <div className="absolute top-2 left-4 w-4 h-4 border-t border-l border-[var(--color-cyan)] opacity-40" />
            <div className="absolute top-2 right-4 w-4 h-4 border-t border-r border-[var(--color-cyan)] opacity-40" />
            <div className="absolute bottom-2 left-4 w-4 h-4 border-b border-l border-[var(--color-cyan)] opacity-40" />
            <div className="absolute bottom-2 right-4 w-4 h-4 border-b border-r border-[var(--color-cyan)] opacity-40" />
          </div>
        )}

        {/* Updated time + tap hint */}
        <div className="flex flex-col items-center gap-1 py-3 pb-48">
          <div className="text-[10px] text-[var(--color-text-dim)] bg-[rgba(10,10,15,0.7)] px-3 py-1 rounded">
            UPDATED: {new Date(radar.updatedAt).toLocaleTimeString("en-MY", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}{" "}
            MYT
          </div>
          {!imageError && (
            <div className="text-[10px] tracking-[1.5px] text-[var(--color-cyan)] opacity-60">
              TAP IMAGE TO ZOOM
            </div>
          )}
        </div>
      </div>

      {/* Mobile: fullscreen zoom viewer */}
      {zoomOpen && isMobile && (
        <ZoomViewer
          src={imageUrl}
          alt={`MetMalaysia ${currentConfig.label}`}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
}

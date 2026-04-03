"use client";

import { useEffect, useState } from "react";

const BOOT_LINES = [
  "INITIALIZING PANTAULAH CORE...",
  "ESTABLISHING SECURE CONNECTION...",
  "LOADING GEOSPATIAL DATA [16 ENTITIES]...",
  "SYNCING INTELLIGENCE FEEDS...",
  "CALIBRATING CHOROPLETH ENGINE...",
  "SYSTEM READY.",
];

interface LoadingScreenProps {
  onComplete: () => void;
}

export default function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [currentLine, setCurrentLine] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      setVisible(false);
      onComplete();
      return;
    }

    const interval = setInterval(() => {
      setCurrentLine((prev) => {
        if (prev >= BOOT_LINES.length - 1) {
          clearInterval(interval);
          setTimeout(() => {
            setVisible(false);
            onComplete();
          }, 600);
          return prev;
        }
        return prev + 1;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--color-bg)] flex flex-col items-center justify-center transition-opacity duration-500">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center">
        <img src="/logo-128.png" alt="PANTAULAH" className="w-16 h-16 mb-4 pulse-dot" />
        <div className="text-[var(--color-cyan)] text-xl tracking-[6px] font-bold">
          PANTAULAH
        </div>
      </div>

      {/* Boot log */}
      <div className="font-mono text-xs space-y-1 max-w-md">
        {BOOT_LINES.slice(0, currentLine + 1).map((line, i) => (
          <div
            key={i}
            className={`tracking-wider transition-opacity duration-200 ${
              i === currentLine
                ? "text-[var(--color-cyan)]"
                : "text-[var(--color-text-dim)]"
            }`}
          >
            <span className="text-[var(--color-text-dim)] mr-2">
              [{String(i).padStart(2, "0")}]
            </span>
            {line}
            {i === currentLine && i < BOOT_LINES.length - 1 && (
              <span className="inline-block w-2 h-3 bg-[var(--color-cyan)] ml-1 blink-cursor" />
            )}
            {i === BOOT_LINES.length - 1 && i === currentLine && (
              <span className="text-[var(--color-green)] ml-2">OK</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

type SnapPoint = "peek" | "half" | "full";

const PEEK_HEIGHT = 120;
const HALF_RATIO = 0.5;
const FULL_RATIO = 0.9;

interface BottomSheetProps {
  peek: ReactNode;
  children: ReactNode;
  snap?: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
}

export default function BottomSheet({
  peek,
  children,
  snap: controlledSnap,
  onSnapChange,
}: BottomSheetProps) {
  const [internalSnap, setInternalSnap] = useState<SnapPoint>("half");
  const snap = controlledSnap ?? internalSnap;
  const setSnap = useCallback(
    (s: SnapPoint) => {
      setInternalSnap(s);
      onSnapChange?.(s);
    },
    [onSnapChange]
  );

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    startY: 0,
    startHeight: 0,
  });
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [windowHeight, setWindowHeight] = useState(0);

  useEffect(() => {
    setWindowHeight(window.innerHeight);
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getSnapHeight = useCallback(
    (s: SnapPoint) => {
      if (!windowHeight) return PEEK_HEIGHT;
      switch (s) {
        case "peek":
          return PEEK_HEIGHT;
        case "half":
          return windowHeight * HALF_RATIO;
        case "full":
          return windowHeight * FULL_RATIO;
      }
    },
    [windowHeight]
  );

  const currentHeight = dragHeight ?? getSnapHeight(snap);

  const resolveSnap = useCallback(
    (h: number): SnapPoint => {
      const peekH = PEEK_HEIGHT;
      const halfH = windowHeight * HALF_RATIO;
      const fullH = windowHeight * FULL_RATIO;

      const midPeekHalf = (peekH + halfH) / 2;
      const midHalfFull = (halfH + fullH) / 2;

      if (h < midPeekHalf) return "peek";
      if (h < midHalfFull) return "half";
      return "full";
    },
    [windowHeight]
  );

  const onDragStart = useCallback(
    (clientY: number) => {
      dragRef.current = {
        active: true,
        startY: clientY,
        startHeight: getSnapHeight(snap),
      };
    },
    [snap, getSnapHeight]
  );

  const onDragMove = useCallback(
    (clientY: number) => {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startY - clientY;
      const newH = Math.max(
        PEEK_HEIGHT,
        Math.min(windowHeight * FULL_RATIO, dragRef.current.startHeight + delta)
      );
      setDragHeight(newH);
    },
    [windowHeight]
  );

  const onDragEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (dragHeight != null) {
      setSnap(resolveSnap(dragHeight));
    }
    setDragHeight(null);
  }, [dragHeight, resolveSnap, setSnap]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      onDragStart(e.touches[0].clientY);
    },
    [onDragStart]
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      onDragMove(e.touches[0].clientY);
    },
    [onDragMove]
  );
  const handleTouchEnd = useCallback(() => {
    onDragEnd();
  }, [onDragEnd]);

  // Mouse handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientY);
    const handleMouseUp = () => onDragEnd();
    if (dragRef.current.active || dragHeight != null) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [onDragMove, onDragEnd, dragHeight]);

  const handleTap = useCallback(() => {
    if (snap === "peek") setSnap("half");
    else setSnap("peek");
  }, [snap, setSnap]);

  if (!windowHeight) return null;

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-40 flex flex-col lg:hidden"
      style={{
        height: currentHeight,
        transition: dragHeight != null ? "none" : "height 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        background: "linear-gradient(180deg, #0d0d14 0%, #0a0a0f 100%)",
        borderTop: "1px solid rgba(0, 212, 255, 0.15)",
        borderRadius: "12px 12px 0 0",
        willChange: "height",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          e.preventDefault();
          onDragStart(e.clientY);
        }}
        onClick={handleTap}
      >
        <div className="w-8 h-1 rounded-full bg-[rgba(0,212,255,0.3)]" />
      </div>

      {/* Peek content — always visible */}
      <div className="px-4 pb-2 shrink-0">{peek}</div>

      {/* Scrollable content — visible in half/full */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
        style={{
          opacity: snap === "peek" && dragHeight == null ? 0 : 1,
          transition: "opacity 0.2s ease",
          pointerEvents: snap === "peek" && dragHeight == null ? "none" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

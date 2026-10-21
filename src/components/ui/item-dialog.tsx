"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Native modal focus handling, styled as the app's own panel. */
export default function ItemDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-auto mb-0 md:m-auto w-[calc(100%-1.5rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-lg border border-[var(--color-border-bright)] bg-[var(--color-bg-panel)] text-[var(--color-text)] p-0 backdrop:bg-black/70"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
        <h2 id={id} className="text-sm font-bold break-words min-w-0">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="min-w-11 min-h-11 shrink-0 text-[var(--color-cyan)]"
        >
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>,
    document.body,
  );
}

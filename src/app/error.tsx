"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--color-bg)] flex flex-col items-center justify-center px-6">
      <div className="font-mono text-xs space-y-1 max-w-md w-full">
        <div
          className="text-[var(--color-red)] text-base font-bold tracking-[4px] mb-4"
          style={{ textShadow: "0 0 12px rgba(239, 68, 68, 0.4)" }}
        >
          SYSTEM FAULT
        </div>
        <div className="tracking-wider text-[var(--color-text-dim)]">
          <span className="mr-2">[00]</span>
          UNEXPECTED RUNTIME EXCEPTION
        </div>
        <div className="tracking-wider text-[var(--color-text-dim)]">
          <span className="mr-2">[01]</span>
          TERMINAL STATE PRESERVED
        </div>
        {error.digest && (
          <div className="tracking-wider text-[var(--color-text-dim)] opacity-60 break-all">
            <span className="mr-2">[02]</span>
            REF: {error.digest}
          </div>
        )}
        <div className="pt-5">
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-[11px] tracking-[2px] border rounded transition-all cursor-pointer border-[rgba(0,212,255,0.25)] text-[var(--color-cyan)] hover:border-[var(--color-cyan)] hover:bg-[rgba(0,212,255,0.1)] hover:shadow-[0_0_10px_rgba(0,212,255,0.1)]"
          >
            RELOAD
          </button>
        </div>
      </div>
    </div>
  );
}

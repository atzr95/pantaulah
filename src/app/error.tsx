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
        <div className="text-[var(--color-red)] text-base font-bold tracking-[0.08em] mb-4">
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
            className="px-4 py-2 min-h-11 lg:min-h-9 text-xs tracking-[0.08em] border rounded-md transition-colors cursor-pointer border-[var(--color-border-mid)] text-[var(--color-cyan)] hover:border-[var(--color-cyan)] hover:bg-[var(--color-cyan-soft)]"
          >
            RELOAD
          </button>
        </div>
      </div>
    </div>
  );
}

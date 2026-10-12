import { cn } from "@/lib/utils";

/** One gray placeholder bar. Pulses unless the person asks for reduced motion. */
export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-3 rounded-control bg-surface-sunken motion-safe:animate-pulse", className)} />;
}

/**
 * Placeholder list rows shown while data loads. Only the rows are skeletons: the page
 * title, tabs and nav are rendered for real by each route's loading.tsx.
 */
export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-xs">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 border-t border-border-subtle px-5 py-4 first:border-t-0">
          <SkeletonBar className="h-3.5 w-2/5" />
          <SkeletonBar className="h-2.5 w-1/4" />
        </div>
      ))}
    </div>
  );
}

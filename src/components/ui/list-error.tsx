"use client";

import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown when a list fails to load. It says nothing was changed, because a failed read
 * never writes. Try again runs the route's reset (error boundary) or refreshes the page.
 */
export function ListError({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-card border border-danger/35 bg-danger/10 px-4 py-3"
    >
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-danger-strong" />
      <p className="mr-auto text-small text-near-black">Could not load entries. Nothing was changed.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => (onRetry ? onRetry() : router.refresh())}>
        Try again
      </Button>
    </div>
  );
}

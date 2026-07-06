import { History } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

import type { ResearchRun, ResearchRunStatus } from "./types";

const STATUS_BADGE_VARIANT: Record<ResearchRunStatus, BadgeProps["variant"]> = {
  queued: "neutral",
  running: "info",
  success: "success",
  failed: "danger",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<ResearchRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read-only recent-runs list. No mutation controls anywhere here — adding a
 * manual trigger is explicitly out of scope until Feature 16.
 */
export function ResearchRunsPanel({ runs }: { runs: ResearchRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No research runs yet"
        description="Runs will appear here once the research worker collects data for this client."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_BADGE_VARIANT[run.status]}>
                {STATUS_LABEL[run.status]}
              </Badge>
              <span className="text-small text-muted-foreground">
                {run.triggerType === "worker" ? "Worker" : "Manual"}
                {run.stage ? ` · ${run.stage}` : ""}
              </span>
            </div>
            <span className="font-mono text-caption text-muted-foreground">
              {formatDateTime(run.startedAt)}
              {run.finishedAt ? ` → ${formatDateTime(run.finishedAt)}` : ""}
            </span>
          </div>

          {run.status === "success" ? (
            <p className="text-small text-muted-foreground">
              {run.sourcesProcessed} source{run.sourcesProcessed === 1 ? "" : "s"} ·{" "}
              {run.totalNew} new · {run.skippedDuplicate} duplicate
              {run.errorCount > 0
                ? ` · ${run.errorCount} error${run.errorCount === 1 ? "" : "s"}`
                : ""}
            </p>
          ) : null}

          {run.errorMessage ? (
            <p className="text-small text-danger">{run.errorMessage}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

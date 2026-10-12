"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ResearchRunSummary } from "@/features/research/research-runs/types";

type RunSuccessData = {
  summary: ResearchRunSummary;
  classificationMessage: string | null;
};

type RunState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; data: RunSuccessData }
  | { status: "error"; message: string };

const GENERIC_ERROR_COPY = "Could not run the RSS feeds right now. Please try again.";

/**
 * Fetches new articles from the saved RSS feeds and marks each one relevant or not.
 * Members see the button disabled, with the reason, so it is never hidden from them.
 */
export function RunRssFeedsButton({
  clientId,
  canRun,
  disabledReason,
}: {
  clientId: string;
  canRun: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ status: "idle" });

  async function handleClick() {
    setState({ status: "pending" });

    try {
      const response = await fetch(`/api/client/${clientId}/run-research-agent`, {
        method: "POST",
      });
      const body = await response.json();

      if (!body.success) {
        setState({
          status: "error",
          message:
            typeof body?.error?.message === "string"
              ? body.error.message
              : GENERIC_ERROR_COPY,
        });
        return;
      }

      setState({ status: "success", data: body.data });
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  const isPending = state.status === "pending";

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="brand"
        onClick={handleClick}
        disabled={isPending || !canRun}
        title={!canRun ? (disabledReason ?? undefined) : undefined}
      >
        {isPending ? "Fetching feeds..." : "Run RSS feeds"}
      </Button>
      {!canRun && disabledReason ? (
        <p className="max-w-xs text-right text-caption text-muted-foreground">{disabledReason}</p>
      ) : null}

      {state.status === "success" ? (
        <div className="flex flex-col gap-1 text-right">
          <p role="status" className="text-small text-muted-foreground">
            {state.data.summary.sourcesProcessed} feed
            {state.data.summary.sourcesProcessed === 1 ? "" : "s"} ·{" "}
            {state.data.summary.totalFetched} fetched · {state.data.summary.totalNew} new ·{" "}
            {state.data.summary.skippedDuplicate} already collected
            {state.data.summary.skippedStale ? ` · ${state.data.summary.skippedStale} too old` : ""}
            {state.data.summary.errorCount > 0
              ? ` · ${state.data.summary.errorCount} error${state.data.summary.errorCount === 1 ? "" : "s"}`
              : ""}
          </p>
          {typeof state.data.summary.classifiedCount === "number" &&
          state.data.summary.classifiedCount > 0 ? (
            <p className="text-small text-muted-foreground">
              {state.data.summary.classifiedCount} checked · {state.data.summary.relevantCount ?? 0}{" "}
              relevant · {state.data.summary.irrelevantCount ?? 0} not relevant
              {state.data.summary.classificationErrorCount
                ? ` · ${state.data.summary.classificationErrorCount} could not be checked`
                : ""}
            </p>
          ) : null}
          {state.data.classificationMessage ? (
            <p className="text-small text-muted-foreground">{state.data.classificationMessage}</p>
          ) : null}
        </div>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="max-w-xs text-right text-small text-danger-strong">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

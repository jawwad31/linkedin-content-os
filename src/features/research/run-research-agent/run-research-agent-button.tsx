"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ResearchRunSummary } from "@/features/research/research-runs/types";

type RunSuccessData = {
  summary: ResearchRunSummary;
  classificationMessage: string | null;
  synthesisMessage: string | null;
};

type RunState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; data: RunSuccessData }
  | { status: "error"; message: string };

const GENERIC_ERROR_COPY = "Could not run research right now. Please try again.";

export function RunResearchAgentButton({ clientId }: { clientId: string }) {
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
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" variant="gradient" onClick={handleClick} disabled={isPending}>
          {isPending ? "Running research..." : "Run Research Agent"}
        </Button>
      </div>

      {state.status === "success" ? (
        <div className="flex flex-col gap-1">
          <p className="text-small text-muted-foreground">
            {state.data.summary.sourcesProcessed} source
            {state.data.summary.sourcesProcessed === 1 ? "" : "s"} ·{" "}
            {state.data.summary.totalFetched} fetched · {state.data.summary.totalNew}{" "}
            new · {state.data.summary.skippedDuplicate} duplicate
            {state.data.summary.skippedStale
              ? ` · ${state.data.summary.skippedStale} stale`
              : ""}
            {state.data.summary.errorCount > 0
              ? ` · ${state.data.summary.errorCount} error${state.data.summary.errorCount === 1 ? "" : "s"}`
              : ""}
          </p>
          {typeof state.data.summary.classifiedCount === "number" &&
          state.data.summary.classifiedCount > 0 ? (
            <p className="text-small text-muted-foreground">
              {state.data.summary.classifiedCount} classified ·{" "}
              {state.data.summary.relevantCount ?? 0} relevant ·{" "}
              {state.data.summary.irrelevantCount ?? 0} irrelevant
              {state.data.summary.classificationErrorCount
                ? ` · ${state.data.summary.classificationErrorCount} classification error${state.data.summary.classificationErrorCount === 1 ? "" : "s"}`
                : ""}
            </p>
          ) : null}
          {state.data.classificationMessage ? (
            <p className="text-small text-muted-foreground">
              {state.data.classificationMessage}
            </p>
          ) : null}
          {state.data.synthesisMessage ? (
            <p className="text-small text-muted-foreground">
              {state.data.synthesisMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

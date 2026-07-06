"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ResearchRunSummary } from "@/features/research/research-runs/types";

type RunState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; summary: ResearchRunSummary }
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

      setState({ status: "success", summary: body.data });
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
        <p className="text-small text-muted-foreground">
          {state.summary.sourcesProcessed} source
          {state.summary.sourcesProcessed === 1 ? "" : "s"} ·{" "}
          {state.summary.totalFetched} fetched · {state.summary.totalNew} new ·{" "}
          {state.summary.skippedDuplicate} duplicate
          {state.summary.errorCount > 0
            ? ` · ${state.summary.errorCount} error${state.summary.errorCount === 1 ? "" : "s"}`
            : ""}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

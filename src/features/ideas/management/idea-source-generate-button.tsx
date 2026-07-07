"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { IdeaSourceMode } from "./source-queries";

const GENERIC_ERROR_COPY = "Could not generate ideas. Please try again.";

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function IdeaSourceGenerateButton({
  clientId,
  mode,
  sourceId,
}: {
  clientId: string;
  mode: IdeaSourceMode;
  sourceId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RequestState>({ status: "idle" });

  async function generateIdeas() {
    setState({ status: "pending" });

    try {
      const response = await fetch(`/api/client/${clientId}/ideas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, sourceId }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setState({
          status: "error",
          message:
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : GENERIC_ERROR_COPY,
        });
        return;
      }

      setState({ status: "success", message: "Ideas generated." });
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="accent-purple"
        size="sm"
        disabled={state.status === "pending"}
        onClick={generateIdeas}
      >
        {state.status === "pending" ? "Generating..." : "Generate ideas"}
      </Button>

      {state.status === "success" || state.status === "error" ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-small text-danger"
              : "text-small text-success"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

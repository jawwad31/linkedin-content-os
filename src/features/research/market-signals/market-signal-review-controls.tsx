"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { FOUNDER_TAKE_MAX_LENGTH } from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this Market Signal. Please try again.";
const APPROVED_MESSAGE = "This Market Signal has been approved for ideas.";

type SaveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

type ApproveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

export function MarketSignalReviewControls({
  clientId,
  signalId,
  founderTake,
  approvedForIdeas,
}: {
  clientId: string;
  signalId: string;
  founderTake: string | null;
  approvedForIdeas: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(founderTake ?? "");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [approveState, setApproveState] = useState<ApproveState>({
    status: "idle",
  });

  async function handleSave() {
    setSaveState({ status: "pending" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/market-signals/${signalId}/founder-take`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ founderTake: draft }),
        },
      );
      const body = await response.json();

      if (!body.success) {
        setSaveState({
          status: "error",
          message:
            typeof body?.error?.message === "string"
              ? body.error.message
              : GENERIC_ERROR_COPY,
        });
        return;
      }

      setSaveState({ status: "idle" });
      router.refresh();
    } catch {
      setSaveState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  async function handleApprove() {
    setApproveState({ status: "pending" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/market-signals/${signalId}/approve-for-ideas`,
        { method: "POST" },
      );
      const body = await response.json();

      if (!body.success) {
        setApproveState({
          status: "error",
          message:
            typeof body?.error?.message === "string"
              ? body.error.message
              : GENERIC_ERROR_COPY,
        });
        return;
      }

      setApproveState({ status: "idle" });
      router.refresh();
    } catch {
      setApproveState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  const isSaving = saveState.status === "pending";
  const isApproving = approveState.status === "pending";

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
      <label
        htmlFor={`founder-take-${signalId}`}
        className="text-caption font-medium uppercase tracking-wide text-muted-foreground"
      >
        Founder take
      </label>
      <Textarea
        id={`founder-take-${signalId}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={FOUNDER_TAKE_MAX_LENGTH}
        rows={3}
        placeholder="Add your take on this signal..."
      />

      {saveState.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {saveState.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Founder Take"}
        </Button>

        {approvedForIdeas ? (
          <p className="text-small text-muted-foreground">{APPROVED_MESSAGE}</p>
        ) : (
          <Button
            type="button"
            variant="accent-purple"
            size="sm"
            onClick={handleApprove}
            disabled={isApproving}
          >
            {isApproving ? "Approving..." : "Approve for Ideas"}
          </Button>
        )}
      </div>

      {approveState.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {approveState.message}
        </p>
      ) : null}
    </div>
  );
}

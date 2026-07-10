"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  FOUNDER_TAKE_MAX_LENGTH,
  REACTION_TYPES,
  REACTION_TYPE_LABELS,
  type ReactionType,
} from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this TrendCard. Please try again.";
const APPROVED_MESSAGE = "This TrendCard has been approved for ideas.";

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

const IDLE: RequestState = { status: "idle" };

export function TrendCardReviewControls({
  clientId,
  cardId,
  founderTake,
  approvedForIdeas,
  reactionCount,
  canManageReview,
}: {
  clientId: string;
  cardId: string;
  founderTake: string | null;
  approvedForIdeas: boolean;
  reactionCount: number;
  canManageReview: boolean;
}) {
  const router = useRouter();

  const [draft, setDraft] = useState(founderTake ?? "");
  const [saveState, setSaveState] = useState<RequestState>(IDLE);
  const [approveState, setApproveState] = useState<RequestState>(IDLE);

  const [mode, setMode] = useState<"default" | "react" | "confirm-archive">(
    "default",
  );
  const [reactionType, setReactionType] = useState<ReactionType>("observation");
  const [reactionTake, setReactionTake] = useState("");
  const [reactionProof, setReactionProof] = useState("");
  const [reactState, setReactState] = useState<RequestState>(IDLE);
  const [archiveState, setArchiveState] = useState<RequestState>(IDLE);

  async function postJson(
    path: string,
    body: Record<string, unknown> | null,
    setState: (state: RequestState) => void,
    onSuccess?: () => void,
  ) {
    setState({ status: "pending" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/trend-cards/${cardId}/${path}`,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { method: "POST" },
      );
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

      setState(IDLE);
      onSuccess?.();
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  const isSaving = saveState.status === "pending";
  const isApproving = approveState.status === "pending";
  const isReacting = reactState.status === "pending";
  const isArchiving = archiveState.status === "pending";
  const canArchive = reactionCount === 0;

  if (mode === "react") {
    return (
      <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
          React to this TrendCard
        </p>

        <div className="flex flex-wrap gap-2">
          {REACTION_TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              variant={reactionType === type ? "accent-orange" : "outline"}
              size="sm"
              onClick={() => setReactionType(type)}
            >
              {REACTION_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>

        <label
          htmlFor={`reaction-take-${cardId}`}
          className="text-small font-medium"
        >
          Your take
        </label>
        <Textarea
          id={`reaction-take-${cardId}`}
          value={reactionTake}
          onChange={(event) => setReactionTake(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="What do you agree with, disagree with, or see differently?"
        />

        <label
          htmlFor={`reaction-proof-${cardId}`}
          className="text-small font-medium"
        >
          Proof or example (optional)
        </label>
        <Textarea
          id={`reaction-proof-${cardId}`}
          value={reactionProof}
          onChange={(event) => setReactionProof(event.target.value)}
          maxLength={2000}
          rows={2}
        />

        {reactState.status === "error" ? (
          <p role="alert" className="text-small text-danger">
            {reactState.message}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="gradient"
            size="sm"
            disabled={isReacting || reactionTake.trim().length === 0}
            onClick={() =>
              postJson(
                "react",
                {
                  reactionType,
                  take: reactionTake,
                  proofOrExample: reactionProof,
                },
                setReactState,
                () => {
                  setReactionTake("");
                  setReactionProof("");
                  setMode("default");
                },
              )
            }
          >
            {isReacting ? "Saving..." : "Save reaction"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode("default")}
            disabled={isReacting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "confirm-archive") {
    return (
      <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
        <p className="text-small font-medium">
          Archive this TrendCard? It will be hidden from the list but not
          deleted.
        </p>
        {archiveState.status === "error" ? (
          <p role="alert" className="text-small text-danger">
            {archiveState.message}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isArchiving}
            onClick={() => postJson("archive", null, setArchiveState)}
          >
            {isArchiving ? "Archiving..." : "Confirm archive"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode("default")}
            disabled={isArchiving}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
      <label
        htmlFor={`founder-take-${cardId}`}
        className="text-caption font-medium uppercase tracking-wide text-muted-foreground"
      >
        Founder take
      </label>
      <Textarea
        id={`founder-take-${cardId}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={FOUNDER_TAKE_MAX_LENGTH}
        rows={3}
        placeholder="Add your take on this TrendCard..."
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
          onClick={() =>
            postJson("founder-take", { founderTake: draft }, setSaveState)
          }
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Founder Take"}
        </Button>

        {approvedForIdeas ? (
          <p className="text-small text-muted-foreground">{APPROVED_MESSAGE}</p>
        ) : canManageReview ? (
          <Button
            type="button"
            variant="accent-purple"
            size="sm"
            onClick={() => postJson("approve-for-ideas", null, setApproveState)}
            disabled={isApproving}
          >
            {isApproving ? "Approving..." : "Approve for Ideas"}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode("react")}
        >
          React
        </Button>

        {canManageReview && canArchive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode("confirm-archive")}
          >
            Archive
          </Button>
        ) : null}
      </div>

      {approveState.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {approveState.message}
        </p>
      ) : null}
      {archiveState.status === "error" && mode === "default" ? (
        <p role="alert" className="text-small text-danger">
          {archiveState.message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";

import {
  REACTION_TYPES,
  REACTION_TYPE_LABELS,
  type ReactionType,
} from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this TrendCard. Please try again.";

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

const IDLE: RequestState = { status: "idle" };

export function TrendCardReviewControls({
  clientId,
  cardId,
  cardTitle,
  approvedForIdeas,
  reactionCount,
  canManageReview,
}: {
  clientId: string;
  cardId: string;
  cardTitle: string;
  approvedForIdeas: boolean;
  reactionCount: number;
  canManageReview: boolean;
}) {
  const router = useRouter();

  const [approveState, setApproveState] = useState<RequestState>(IDLE);

  const [mode, setMode] = useState<"default" | "react">("default");
  const [reactionType, setReactionType] = useState<ReactionType>("observation");
  const [reactionTake, setReactionTake] = useState("");
  const [reactionProof, setReactionProof] = useState("");
  const [reactState, setReactState] = useState<RequestState>(IDLE);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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

  const isApproving = approveState.status === "pending";
  const isReacting = reactState.status === "pending";

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

        <div className="flex flex-wrap items-center gap-2">
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

  return (
    <>
      <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {reactionCount === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMode("react")}
              >
                React
              </Button>
            ) : (
              <p className="text-small text-muted-foreground">Reaction recorded.</p>
            )}

            {canManageReview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            ) : null}
          </div>

          {approvedForIdeas ? null : canManageReview ? (
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
        </div>

        {approveState.status === "error" ? (
          <p role="alert" className="text-small text-danger">
            {approveState.message}
          </p>
        ) : null}
      </div>

      <DestructiveConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        recordType="TrendCard"
        recordTitle={cardTitle}
        onConfirm={async () => {
          const res = await fetch(`/api/client/${clientId}/trend-cards/${cardId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete TrendCard.",
            };
          }
          return { ok: true };
        }}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}

"use client";

import { CheckCircle2, PenSquare, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { ReviewPostStatus } from "./queries";
import { EDIT_NOTE_MAX_LENGTH } from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this post. Please try again.";

type ActionName = "approve" | "needs-edit" | "redraft" | "reject";

type RequestState =
  | { status: "idle" }
  | { status: "pending"; action: ActionName }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

const IDLE: RequestState = { status: "idle" };

function statusMessage(action: ActionName): string {
  if (action === "approve") return "Post approved.";
  if (action === "needs-edit") return "Post marked needs edit.";
  if (action === "redraft") return "Post redrafted and returned to review.";
  return "Post rejected.";
}

export function PostReviewActions({
  clientId,
  postId,
  status,
  canReview,
  canRedraft: hasRedraftPermission,
}: {
  clientId: string;
  postId: string;
  status: ReviewPostStatus;
  canReview: boolean;
  canRedraft: boolean;
}) {
  const router = useRouter();
  const [editNote, setEditNote] = useState("");
  const [state, setState] = useState<RequestState>(IDLE);
  const isPending = state.status === "pending";
  const canApprove = canReview && (status === "review" || status === "needs_edit");
  const canNeedsEdit = canReview && status === "review";
  const canRedraft = hasRedraftPermission && status === "needs_edit";
  const canReject = canReview && (status === "review" || status === "needs_edit");

  async function submitAction(action: ActionName) {
    const trimmedNote = editNote.trim();
    if (action === "needs-edit" && trimmedNote.length === 0) {
      setState({ status: "error", message: "Edit note is required." });
      return;
    }

    setState({ status: "pending", action });

    try {
      const response = await fetch(
        `/api/client/${clientId}/posts/${postId}/${action}`,
        {
          method: "POST",
          headers:
            action === "needs-edit"
              ? { "Content-Type": "application/json" }
              : undefined,
          body:
            action === "needs-edit"
              ? JSON.stringify({ editNote: trimmedNote })
              : undefined,
        },
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

      setState({ status: "success", message: statusMessage(action) });
      setEditNote("");
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-4 shadow-xs">
      {canReview ? <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={`edit-note-${postId}`}
            className="text-caption font-medium uppercase tracking-wide text-muted-foreground"
          >
            Edit Note
          </label>
          <span className="font-mono text-caption text-muted-foreground">
            {editNote.length}/{EDIT_NOTE_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id={`edit-note-${postId}`}
          value={editNote}
          onChange={(event) => {
            setEditNote(event.target.value);
            if (state.status !== "idle") setState(IDLE);
          }}
          maxLength={EDIT_NOTE_MAX_LENGTH}
          rows={3}
          disabled={!canNeedsEdit || isPending}
          placeholder="Add the edit needed before this post can be approved."
        />
      </div> : null}

      {state.status === "error" || state.status === "success" ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-small text-danger-strong"
              : "text-small text-success-strong"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border-grey pt-3 sm:flex-row sm:items-center sm:justify-between">
        {canReview ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canNeedsEdit || isPending}
            onClick={() => submitAction("needs-edit")}
            className="w-full rounded-full sm:w-auto"
          >
            <PenSquare aria-hidden="true" className="h-4 w-4" />
            {state.status === "pending" && state.action === "needs-edit"
              ? "Saving..."
              : "Needs Edit"}
          </Button>
        ) : null}
        {canRedraft ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => submitAction("redraft")}
            className="w-full rounded-full sm:w-auto"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            {state.status === "pending" && state.action === "redraft"
              ? "Redrafting..."
              : "Redraft"}
          </Button>
        ) : null}
        {canReview ? <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canReject || isPending}
            onClick={() => submitAction("reject")}
            className="flex-1 rounded-full text-danger-strong hover:bg-danger/10 hover:text-danger-strong sm:flex-none"
          >
            <XCircle aria-hidden="true" className="h-4 w-4" />
            {state.status === "pending" && state.action === "reject"
              ? "Rejecting..."
              : "Reject"}
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            disabled={!canApprove || isPending}
            onClick={() => submitAction("approve")}
            className="flex-1 rounded-full px-6 sm:flex-none"
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {state.status === "pending" && state.action === "approve"
              ? "Approving..."
              : "Approve"}
          </Button>
        </div> : null}
      </div>
    </div>
  );
}

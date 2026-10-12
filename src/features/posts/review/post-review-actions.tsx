"use client";

import Link from "next/link";
import { CheckCircle2, PenSquare, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cannotReason } from "@/lib/access/permission-copy";

import type { ReviewPostStatus } from "./queries";
import { EDIT_NOTE_MAX_LENGTH } from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this post. Nothing was changed. Please try again.";
const CONNECTION_ERROR_COPY =
  "The connection was interrupted, so the result is unknown. Reload the post to see its current state before trying again.";

type ActionName = "approve" | "needs-edit" | "redraft" | "reject";
type NoteAction = "needs-edit" | "reject";

type RequestState =
  | { status: "idle" }
  | { status: "pending"; action: ActionName }
  | { status: "error"; message: string; stale?: boolean }
  | { status: "success"; message: string };

const IDLE: RequestState = { status: "idle" };

function statusMessage(action: ActionName, version: number): string {
  if (action === "approve") return `Version ${version} approved.`;
  if (action === "needs-edit") return "Edits requested.";
  if (action === "redraft") return "Post redrafted and returned to review.";
  return "Post rejected. Its entry is available again.";
}

const NOTE_COPY: Record<NoteAction, { label: string; placeholder: string; submit: string; pending: string }> = {
  "needs-edit": {
    label: "What needs to change?",
    placeholder: "One line on the edit needed before this can be approved.",
    submit: "Send edit request",
    pending: "Sending...",
  },
  reject: {
    label: "Why is this rejected?",
    placeholder: "One line on why this post will not be used.",
    submit: "Reject post",
    pending: "Rejecting...",
  },
};

/**
 * The reviewer's decision. Approval names the exact version that was read; a newer
 * version is refused. Request edits and Reject each ask for a one-line note.
 */
export function PostReviewActions({
  clientId,
  postId,
  status,
  version,
  canReview,
  canRedraft: hasRedraftPermission,
}: {
  clientId: string;
  postId: string;
  status: ReviewPostStatus;
  version: number;
  canReview: boolean;
  canRedraft: boolean;
}) {
  const router = useRouter();
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<RequestState>(IDLE);
  const isPending = state.status === "pending";
  const canApprove = canReview && (status === "review" || status === "needs_edit");
  const canNeedsEdit = canReview && status === "review";
  const canRedraft = hasRedraftPermission && status === "needs_edit";
  const canReject = canReview && (status === "review" || status === "needs_edit");
  const canEdit = canReview && status !== "published" && status !== "rejected";
  // Edit and Redraft stay on screen when the person lacks the capability: disabled, with one reason line.
  const editStatusOpen = status !== "published" && status !== "rejected";
  const showRedraft = status === "needs_edit";
  const reviewReason = canReview ? null : cannotReason("approve posts", ["posts_review"]);
  const redraftReason = showRedraft && !hasRedraftPermission ? cannotReason("redraft posts", ["posts_draft"]) : null;

  async function submit(action: ActionName, body?: Record<string, unknown>) {
    setState({ status: "pending", action });
    try {
      const response = await fetch(`/api/client/${clientId}/posts/${postId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();

      if (!payload.success) {
        setState({
          status: "error",
          message: typeof payload?.error?.message === "string" ? payload.error.message : GENERIC_ERROR_COPY,
          stale: payload?.error?.code === "STALE_VERSION",
        });
        return;
      }

      setState({ status: "success", message: statusMessage(action, version) });
      setNote("");
      setNoteAction(null);
      router.refresh();
    } catch {
      setState({ status: "error", message: CONNECTION_ERROR_COPY, stale: true });
    }
  }

  function submitNote() {
    if (!noteAction) return;
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      setState({ status: "error", message: "Add a short note first." });
      return;
    }
    void submit(noteAction, noteAction === "needs-edit" ? { editNote: trimmed } : { note: trimmed });
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex max-h-[55vh] flex-col gap-3 overflow-y-auto rounded-none border-x-0 border-b-0 border-t border-border-grey bg-white p-4 shadow-md sm:static sm:mx-0 sm:max-h-none sm:gap-4 sm:overflow-visible sm:rounded-card sm:border sm:shadow-xs">
      {noteAction ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`review-note-${postId}`}
              className="text-small font-medium text-near-black"
            >
              {NOTE_COPY[noteAction].label}
            </label>
            <span className="font-mono text-caption text-muted-foreground">
              {note.length}/{EDIT_NOTE_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id={`review-note-${postId}`}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (state.status !== "idle") setState(IDLE);
            }}
            maxLength={EDIT_NOTE_MAX_LENGTH}
            rows={2}
            disabled={isPending}
            placeholder={NOTE_COPY[noteAction].placeholder}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={noteAction === "reject" ? "destructive" : "brand"}
              disabled={isPending}
              onClick={submitNote}
            >
              {isPending ? NOTE_COPY[noteAction].pending : NOTE_COPY[noteAction].submit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => { setNoteAction(null); setNote(""); setState(IDLE); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "error" || state.status === "success" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={state.status === "error" ? "text-small text-danger-strong" : "text-small text-success-strong"}
          >
            {state.message}
          </p>
          {state.status === "error" && state.stale ? (
            <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
              Reload post
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Button
            type="button"
            variant="brand"
            size="sm"
            disabled={!canApprove || isPending}
            onClick={() => void submit("approve", { version })}
            className="col-span-2 w-full sm:col-auto sm:w-auto"
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {state.status === "pending" && state.action === "approve" ? "Approving..." : `Approve version ${version}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canNeedsEdit || isPending}
            onClick={() => { setNoteAction("needs-edit"); setState(IDLE); }}
            className="w-full sm:w-auto"
          >
            <PenSquare aria-hidden="true" className="h-4 w-4" />
            Request edits
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canReject || isPending}
            onClick={() => { setNoteAction("reject"); setState(IDLE); }}
            className="w-full text-danger-strong hover:bg-danger/10 hover:text-danger-strong sm:w-auto"
          >
            <XCircle aria-hidden="true" className="h-4 w-4" />
            Reject
          </Button>
          {editStatusOpen ? (canEdit ? (
            <Link
              href={`/client/${clientId}/posts/${postId}/edit`}
              className="inline-flex h-[38px] w-full items-center justify-center rounded-control border sm:w-auto border-border-grey bg-white px-4 text-small font-medium text-near-black hover:bg-soft-white"
            >
              Edit
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-[38px] w-full items-center justify-center rounded-control border sm:w-auto border-border-grey bg-white px-4 text-small font-medium text-near-black opacity-45"
            >
              Edit
            </span>
          )) : null}
          {showRedraft ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasRedraftPermission || isPending}
              onClick={() => void submit("redraft")}
              className="w-full sm:w-auto"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {state.status === "pending" && state.action === "redraft" ? "Redrafting..." : "Redraft"}
            </Button>
          ) : null}
      </div>
      {reviewReason ? <p className="text-small text-muted-foreground">{reviewReason}</p> : null}
      {redraftReason ? <p className="text-small text-muted-foreground">{redraftReason}</p> : null}

      {canReview ? (
        <p className="text-caption text-muted-foreground">
          Approval applies to version {version} only. Request edits and Reject each ask for a one-line note.
          {canRedraft ? " Redraft rewrites the post from your last edit note." : ""}
        </p>
      ) : null}
    </div>
  );
}

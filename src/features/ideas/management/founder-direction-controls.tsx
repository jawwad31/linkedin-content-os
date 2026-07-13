"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import type { EffectiveClientRole } from "@/lib/access/roles";

import { FOUNDER_DIRECTION_MAX_LENGTH } from "./schemas";

const GENERIC_ERROR_COPY = "Could not update this idea. Please try again.";

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

const IDLE: RequestState = { status: "idle" };

export function FounderDirectionControls({
  clientId,
  ideaId,
  ideaAngle,
  founderDirection,
  role,
}: {
  clientId: string;
  ideaId: string;
  ideaAngle: string;
  founderDirection: string | null;
  role: EffectiveClientRole;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(founderDirection ?? "");
  const [directionState, setDirectionState] = useState<RequestState>(IDLE);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isSaving = directionState.status === "pending";
  const isAdmin = role === "agency_admin" || role === "client_admin";

  async function saveDirection() {
    setDirectionState({ status: "pending" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/ideas/${ideaId}/founder-direction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ founderDirection: draft }),
        },
      );
      const payload = await response.json();

      if (!payload.success) {
        setDirectionState({
          status: "error",
          message:
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : GENERIC_ERROR_COPY,
        });
        return;
      }

      setDirectionState({
        status: "success",
        message: draft.trim().length > 0 ? "Direction saved." : "Direction cleared.",
      });
      router.refresh();
    } catch {
      setDirectionState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 rounded-control border border-border-grey bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={`founder-direction-${ideaId}`}
            className="text-caption font-medium uppercase tracking-wide text-muted-foreground"
          >
            Founder Direction
          </label>
          <span className="font-mono text-caption text-muted-foreground">
            {draft.length}/{FOUNDER_DIRECTION_MAX_LENGTH}
          </span>
        </div>

        <Textarea
          id={`founder-direction-${ideaId}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (directionState.status !== "idle") setDirectionState(IDLE);
          }}
          maxLength={FOUNDER_DIRECTION_MAX_LENGTH}
          rows={3}
          placeholder="Add direction, constraints, examples, or the take this post should preserve."
        />

        {directionState.status === "error" ||
        directionState.status === "success" ? (
          <p
            role={directionState.status === "error" ? "alert" : "status"}
            className={
              directionState.status === "error"
                ? "text-small text-danger"
                : "text-small text-success"
            }
          >
            {directionState.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={saveDirection}
          >
            {isSaving ? "Saving..." : "Save Direction"}
          </Button>
          {isAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <DestructiveConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        recordType="Content Idea"
        recordTitle={ideaAngle}
        onConfirm={async () => {
          const res = await fetch(`/api/client/${clientId}/ideas/${ideaId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete idea.",
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

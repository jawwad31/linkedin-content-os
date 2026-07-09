"use client";

import { CheckCircle2, Clipboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const GENERIC_COPY_ERROR = "Could not copy this post. Please try again.";
const GENERIC_PUBLISH_ERROR = "Could not update this post. Please try again.";

type ActionState =
  | { status: "idle" }
  | { status: "copy-success"; message: string }
  | { status: "publish-success"; message: string }
  | { status: "error"; message: string }
  | { status: "pending-publish" };

const IDLE: ActionState = { status: "idle" };

export function PublishPostActions({
  clientId,
  postId,
  postText,
  canMarkPublished,
}: {
  clientId: string;
  postId: string;
  postText: string;
  canMarkPublished: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>(IDLE);
  const isPublishing = state.status === "pending-publish";

  async function copyPost() {
    try {
      await navigator.clipboard.writeText(postText);
      setState({ status: "copy-success", message: "Post text copied." });
    } catch {
      setState({ status: "error", message: GENERIC_COPY_ERROR });
    }
  }

  async function markPublished() {
    setState({ status: "pending-publish" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/posts/${postId}/mark-published`,
        { method: "POST" },
      );
      const payload = await response.json();

      if (!payload.success) {
        setState({
          status: "error",
          message:
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : GENERIC_PUBLISH_ERROR,
        });
        return;
      }

      setState({
        status: "publish-success",
        message: "Post marked as published.",
      });
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_PUBLISH_ERROR });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {state.status === "error" ||
      state.status === "copy-success" ||
      state.status === "publish-success" ? (
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copyPost}
          disabled={isPublishing}
        >
          <Clipboard aria-hidden="true" className="h-4 w-4" />
          Copy Text
        </Button>

        {canMarkPublished ? (
          <Button
            type="button"
            variant="accent-orange"
            size="sm"
            onClick={markPublished}
            disabled={isPublishing}
          >
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {isPublishing ? "Marking..." : "Mark Published"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  parseQaBlockDetails,
  QA_RECOMMENDED_ACTION_LABELS,
  QA_REASON_CODE_LABELS,
  type QaBlockDetails,
} from "@/lib/ai/playbooks/qa-block-reasons";

const GENERIC_ERROR_COPY = "Could not generate this post. Please try again.";

type RequestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string; details?: QaBlockDetails }
  | { status: "success"; postId: string; alreadyGenerated: boolean };

const IDLE: RequestState = { status: "idle" };

export function GeneratePostButton({
  clientId,
  ideaId,
}: {
  clientId: string;
  ideaId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RequestState>(IDLE);
  const isPending = state.status === "pending";

  async function generatePost() {
    setState({ status: "pending" });

    try {
      const response = await fetch(
        `/api/client/${clientId}/ideas/${ideaId}/generate-post`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
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
          details: parseQaBlockDetails(payload?.error?.details),
        });
        return;
      }

      const postId =
        typeof payload?.data?.postId === "string" ? payload.data.postId : null;

      if (!postId) {
        setState({ status: "error", message: GENERIC_ERROR_COPY });
        return;
      }

      setState({
        status: "success",
        postId,
        alreadyGenerated: payload?.data?.alreadyGenerated === true,
      });
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  if (state.status === "success") {
    const label = state.alreadyGenerated ? "Open Existing Post" : "Open Post";
    return (
      <div className="flex flex-col items-start gap-2">
        <Link
          href={`/client/${clientId}/posts/${state.postId}/review`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <FileText aria-hidden="true" className="h-4 w-4" />
          {label}
        </Link>
        <p role="status" className="text-small text-success-strong">
          {state.alreadyGenerated
            ? "Post already generated."
            : "Post draft created."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="brand"
        size="sm"
        disabled={isPending}
        onClick={generatePost}
      >
        <FileText aria-hidden="true" className="h-4 w-4" />
        {isPending ? "Generating..." : "Generate Post"}
      </Button>

      {state.status === "error" ? (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-small text-danger-strong">
            {state.message}
          </p>
          {state.details ? (
            <div className="flex flex-col gap-1 text-small text-muted-foreground">
              <ul className="list-disc pl-4">
                {state.details.reasonCodes.map((code) => (
                  <li key={code}>{QA_REASON_CODE_LABELS[code]}</li>
                ))}
              </ul>
              {state.details.recommendedActions.length > 0 ? (
                <p>
                  Try:{" "}
                  {state.details.recommendedActions
                    .map((action) => QA_RECOMMENDED_ACTION_LABELS[action])
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

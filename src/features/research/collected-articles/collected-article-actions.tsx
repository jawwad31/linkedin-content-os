"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { CollectedArticleStatus } from "./queries";

import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";

type MarkTarget = "relevant" | "irrelevant";

type ActionState =
  | { status: "idle" }
  | { status: "pending"; target: MarkTarget }
  | { status: "error"; message: string };

const GENERIC_ERROR_COPY = "Could not update this article. Please try again.";

export function CollectedArticleActions({
  clientId,
  itemId,
  status,
}: {
  clientId: string;
  itemId: string;
  status: CollectedArticleStatus;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  async function handleMark(target: MarkTarget) {
    setState({ status: "pending", target });

    try {
      const response = await fetch(
        `/api/client/${clientId}/market-items/${itemId}/mark-${target}`,
        { method: "POST" },
      );
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

      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({ status: "error", message: GENERIC_ERROR_COPY });
    }
  }

  const isPending = (target: MarkTarget) =>
    state.status === "pending" && state.target === target;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleMark("relevant")}
          disabled={state.status === "pending" || status === "relevant"}
          className="max-sm:flex-1"
        >
          {isPending("relevant") ? "Marking..." : "Mark relevant"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleMark("irrelevant")}
          disabled={state.status === "pending" || status === "irrelevant"}
          className="max-sm:flex-1"
        >
          {isPending("irrelevant") ? "Marking..." : "Mark irrelevant"}
        </Button>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="text-small text-danger-strong">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function ArticleDeleteButton({
  clientId,
  articleId,
  articleTitle,
}: {
  clientId: string;
  articleId: string;
  articleTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong self-start"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <DestructiveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        recordType="Collected Article"
        recordTitle={articleTitle}
        onConfirm={async () => {
          const res = await fetch(`/api/client/${clientId}/market-items/${articleId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete article.",
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

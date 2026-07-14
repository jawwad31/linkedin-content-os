"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import type { ReviewPost } from "./queries";

export function PostDeleteButton({
  clientId,
  post,
  redirectToPosts = false,
}: {
  clientId: string;
  post: ReviewPost;
  redirectToPosts?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const requiresTypedConfirmation =
    post.status === "approved" || post.status === "published";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong h-7 px-2 shrink-0 self-start"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <DestructiveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        recordType="Post"
        recordTitle={post.finalPost.substring(0, 40) + (post.finalPost.length > 40 ? "..." : "")}
        requiresTypedConfirmation={requiresTypedConfirmation}
        onConfirm={async (confirmText) => {
          const res = await fetch(`/api/client/${clientId}/posts/${post.id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmDelete: confirmText }),
          });
          if (!res.ok) {
            const data = await res.json();
            return {
              ok: false,
              error: data.error?.message || "Failed to delete post.",
            };
          }
          return { ok: true };
        }}
        onSuccess={() => {
          if (redirectToPosts) {
            router.push(`/client/${clientId}/posts`);
          } else {
            router.refresh();
          }
        }}
      />
    </>
  );
}

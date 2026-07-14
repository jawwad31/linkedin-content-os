"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Clock, AlertCircle, CheckCircle2, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { formatUtcDate } from "@/lib/format/date";
import type { ReviewPost, ReviewPostStatus } from "@/features/posts/review/queries";
import { SegmentedNavigation } from "@/components/ui/segmented-navigation";
import type { EffectiveClientRole } from "@/lib/access/roles";

type TabId = "needs_review" | "approved" | "rejected" | "published";

const STATUS_LABELS: Record<ReviewPostStatus, string> = {
  review: "Review",
  needs_edit: "Needs Edit",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

const STATUS_BADGE_VARIANT: Record<
  ReviewPostStatus,
  "neutral" | "success" | "warning" | "danger" | "outline"
> = {
  review: "neutral",
  needs_edit: "warning",
  approved: "success",
  published: "success",
  rejected: "danger",
};

export function PostsView({
  clientId,
  posts,
  role,
}: {
  clientId: string;
  posts: ReviewPost[];
  role: EffectiveClientRole;
}) {
  const isAdmin = role === "agency_admin" || role === "client_admin";
  const [activeTab, setActiveTab] = useState<TabId>("needs_review");

  const needsReviewPosts = posts.filter(
    (p) => p.status === "review" || p.status === "needs_edit"
  );
  const approvedPosts = posts.filter((p) => p.status === "approved");
  const rejectedPosts = posts.filter((p) => p.status === "rejected");
  const publishedPosts = posts.filter((p) => p.status === "published");

  const segmentedItems = [
    { id: "needs_review" as TabId, label: "Needs Review", count: needsReviewPosts.length },
    { id: "approved" as TabId, label: "Approved", count: approvedPosts.length },
    { id: "rejected" as TabId, label: "Rejected", count: rejectedPosts.length },
    { id: "published" as TabId, label: "Published", count: publishedPosts.length },
  ];

  const getFilteredPosts = () => {
    switch (activeTab) {
      case "needs_review":
        return needsReviewPosts;
      case "approved":
        return approvedPosts;
      case "rejected":
        return rejectedPosts;
      case "published":
        return publishedPosts;
      default:
        return [];
    }
  };

  const currentPosts = getFilteredPosts();

  const getEmptyState = () => {
    switch (activeTab) {
      case "needs_review":
        return {
          title: "No posts need review.",
          description: "All drafted posts have been processed.",
          icon: CheckCircle2,
        };
      case "approved":
        return {
          title: "No approved posts yet.",
          description: "Approved posts ready for manual publishing will appear here.",
          icon: BookOpen,
        };
      case "rejected":
        return {
          title: "No rejected posts.",
          description: "Posts that didn't meet criteria will appear here.",
          icon: AlertCircle,
        };
      case "published":
        return {
          title: "No posts have been published.",
          description: "Track your manually published history here.",
          icon: Clock,
        };
    }
  };

  const emptyState = getEmptyState();

  return (
    <div className="flex flex-col gap-6">
      {/* Custom navigation tabs */}
      <SegmentedNavigation
        items={segmentedItems}
        activeId={activeTab}
        onChange={setActiveTab}
        className="self-start"
      />

      {currentPosts.length === 0 ? (
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {currentPosts.map((post) => {
            // Short preview of post
            const previewText = post.finalPost.length > 200
              ? `${post.finalPost.substring(0, 200)}...`
              : post.finalPost;

            return (
              <div
                key={post.id}
                className="group relative flex flex-col gap-4 rounded-card border border-border-grey bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_BADGE_VARIANT[post.status]}>
                      {STATUS_LABELS[post.status] ?? post.status}
                    </Badge>
                    <span className="font-mono text-caption text-muted-foreground">
                      Created {formatUtcDate(post.createdAt)}
                    </span>
                    {post.publishedAt && (
                      <span className="font-mono text-caption text-muted-foreground">
                        • Published {formatUtcDate(post.publishedAt)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/client/${clientId}/posts/${post.id}/review`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Maximize2 aria-hidden="true" className="h-4 w-4" />
                      Review Post
                    </Link>
                    {isAdmin && (
                      <PostDeleteButton
                        clientId={clientId}
                        post={post}
                      />
                    )}
                  </div>
                </div>

                <div className="text-body leading-relaxed text-near-black whitespace-pre-line">
                  {previewText}
                </div>

                {post.idea && (
                  <div className="border-t border-border-grey pt-3">
                    <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                      Content Idea Angle
                    </p>
                    <p className="mt-1 text-small text-near-black">
                      {post.idea.angle}
                    </p>
                  </div>
                )}

                {post.editNote && post.status === "needs_edit" && (
                  <div className="rounded-control border border-warning/20 bg-warning/5 px-3 py-2">
                    <p className="text-caption font-medium uppercase tracking-wide text-warning-strong">
                      Edit Note
                    </p>
                    <p className="mt-1 text-small text-near-black">
                      {post.editNote}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PostDeleteButton({
  clientId,
  post,
}: {
  clientId: string;
  post: ReviewPost;
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
        className="text-danger-strong hover:bg-danger/10 hover:text-danger-strong h-7 px-2"
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
          router.refresh();
        }}
      />
    </>
  );
}

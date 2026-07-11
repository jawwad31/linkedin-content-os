"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatUtcDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { ReviewPost, ReviewPostStatus } from "@/features/posts/review/queries";

type TabId = "needs_review" | "approved" | "rejected" | "published";

const TABS: { id: TabId; label: string }[] = [
  { id: "needs_review", label: "Needs Review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "published", label: "Published" },
];

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
}: {
  clientId: string;
  posts: ReviewPost[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("needs_review");

  // Filtering based on workflow states
  const needsReviewPosts = posts.filter(
    (p) => p.status === "review" || p.status === "needs_edit"
  );
  const approvedPosts = posts.filter((p) => p.status === "approved");
  const rejectedPosts = posts.filter((p) => p.status === "rejected");
  const publishedPosts = posts.filter((p) => p.status === "published");

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
      <div className="flex flex-wrap gap-1.5 rounded-full bg-soft-white p-1.5 self-start">
        {TABS.map((tab) => {
          let count = 0;
          if (tab.id === "needs_review") count = needsReviewPosts.length;
          else if (tab.id === "approved") count = approvedPosts.length;
          else if (tab.id === "rejected") count = rejectedPosts.length;
          else if (tab.id === "published") count = publishedPosts.length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-small font-medium text-muted-foreground transition-colors hover:text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2",
                activeTab === tab.id && "bg-white text-near-black shadow-sm"
              )}
            >
              {tab.label}
              {count > 0 ? (
                <span className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-caption font-mono",
                  activeTab === tab.id ? "bg-soft-white text-near-black" : "bg-soft-white text-muted-foreground"
                )}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

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
                  
                  <Link
                    href={`/client/${clientId}/posts/${post.id}/review`}
                    className="inline-flex items-center gap-1 text-small font-medium text-brand-orange hover:underline focus-visible:outline-none"
                  >
                    View Details
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
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
                    <p className="text-caption font-medium uppercase tracking-wide text-warning-foreground">
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

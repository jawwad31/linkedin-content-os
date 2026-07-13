import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleManageWorkflowReview,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { PostReviewActions } from "./post-review-actions";
import { PostDeleteButton } from "./post-delete-button";
import type { ReviewPost, ReviewPostStatus } from "./queries";

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

const SOURCE_LABELS: Record<string, string> = {
  founder_experience: "Founder Experience",
  trend_card: "TrendCard",
  trend_reaction: "Trend Reaction",
};

function compactJson(value: unknown): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function ReviewField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0 rounded-control border border-border-grey bg-soft-white px-3 py-2">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-small text-near-black">
        {value}
      </p>
    </div>
  );
}

function SourceMetadata({ post }: { post: ReviewPost }) {
  const sourceContext = compactJson(post.sourceContextUsed);

  if (!post.idea && !sourceContext) return null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {post.idea ? (
        <div className="min-w-0 rounded-control border border-border-grey bg-soft-white px-3 py-2">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Linked Idea
          </p>
          <p className="mt-1 break-words text-small font-medium text-near-black">
            {post.idea.angle}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            {SOURCE_LABELS[post.idea.sourceType] ?? post.idea.sourceType}
          </p>
        </div>
      ) : null}

      {sourceContext ? (
        <div className="min-w-0 rounded-control border border-border-grey bg-soft-white px-3 py-2">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Source Context Used
          </p>
          <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-caption text-near-black">
            {sourceContext}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function PostCard({
  clientId,
  role,
  post,
}: {
  clientId: string;
  role: EffectiveClientRole;
  post: ReviewPost;
}) {
  const canManage = canRoleManageWorkflowReview(role);

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-4 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[post.status]}>
              {STATUS_LABELS[post.status] ?? post.status}
            </Badge>
            <span className="font-mono text-caption text-muted-foreground">
              {formatUtcDate(post.createdAt)}
            </span>
          </div>
          <h2 className="break-words font-heading text-card-title text-near-black">
            {post.hook ?? "Generated post draft"}
          </h2>
        </div>
        {(role === "agency_admin" || role === "client_admin") && (
          <PostDeleteButton
            clientId={clientId}
            post={post}
            redirectToPosts={true}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 rounded-control border border-border-grey bg-white p-4">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            LinkedIn Draft
          </p>
          <div className="mt-3 whitespace-pre-line break-words text-body leading-7 text-near-black">
            {post.finalPost}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <ReviewField label="Hook" value={post.hook} />
          <ReviewField label="Body" value={post.body} />
          <ReviewField label="CTA intent" value={post.ctaIntent} />
          <ReviewField
            label="Buyer belief shift"
            value={post.buyerBeliefShift}
          />
          <ReviewField label="Proof notes" value={post.proofNotes} />
          <ReviewField label="Risk notes" value={post.riskNotes} />
          <ReviewField label="Current edit note" value={post.editNote} />
        </div>
      </div>

      <SourceMetadata post={post} />

      {canManage ? (
        <PostReviewActions
          clientId={clientId}
          postId={post.id}
          status={post.status}
        />
      ) : null}
    </article>
  );
}

export function PostReviewPanel({
  clientId,
  role,
  posts,
}: {
  clientId: string;
  role: EffectiveClientRole;
  posts: ReviewPost[];
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6">
        <EmptyState
          icon={FileText}
          title="No posts waiting for review"
          description="Generated post drafts will appear here until they are approved, rejected, or archived."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!canRoleManageWorkflowReview(role) ? (
        <div className="rounded-control border border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
          Client Users can view drafts but cannot approve, reject, archive, or
          publish posts.
        </div>
      ) : null}

      {posts.map((post) => (
        <PostCard key={post.id} clientId={clientId} role={role} post={post} />
      ))}
    </div>
  );
}

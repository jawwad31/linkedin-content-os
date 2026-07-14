import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { getReviewPost, type ReviewPostStatus } from "@/features/posts/review/queries";
import { PostDeleteButton } from "@/features/posts/review/post-delete-button";
import { PostReviewActions } from "@/features/posts/review/post-review-actions";
import { canRoleManageWorkflowReview } from "@/lib/access/roles";
import { formatUtcDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { getServerUser } from "@/lib/supabase/session";

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
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string | null;
  icon: LucideIcon;
  iconClassName: string;
}) {
  if (!value) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border-grey px-4 py-3">
        <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <CardTitle className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-3">
        <p className="whitespace-pre-line break-words text-small text-near-black">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function PostReviewPage({
  params,
}: {
  params: Promise<{ client_id: string; post_id: string }>;
}) {
  const { client_id: clientId, post_id: postId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  if (!role) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
        You do not have access to this client.
      </div>
    );
  }

  // Load the post securely using BOTH clientId and postId
  const postResult = await getReviewPost(clientId, postId);

  if (!postResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href={`/client/${clientId}/posts`}
          className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:text-near-black focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Posts
        </Link>
        <EmptyState
          icon={FileText}
          title="This post is not available"
          description="It may have been deleted, or you might not have access to it."
        />
      </div>
    );
  }

  const { post } = postResult;
  const canManage = canRoleManageWorkflowReview(role);
  const sourceContext = compactJson(post.sourceContextUsed);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/client/${clientId}/posts`}
        className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:text-near-black focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Posts
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="break-words text-page-title-mobile font-heading font-semibold text-near-black sm:text-page-title">
              Post Review
            </h1>
            <Badge variant={STATUS_BADGE_VARIANT[post.status]}>
              {STATUS_LABELS[post.status] ?? post.status}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-small text-muted-foreground">
            Inspect and review this post&apos;s workflow status and content details.
          </p>
          {post.idea ? (
            <p className="mt-2 max-w-3xl break-words text-small text-muted-foreground">
              <span className="font-medium text-near-black">
                {SOURCE_LABELS[post.idea.sourceType] ?? post.idea.sourceType}
              </span>{" "}
              &middot; {post.idea.angle}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <PostDeleteButton clientId={clientId} post={post} redirectToPosts />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13fr_7fr] lg:items-start">
        {/* Left column: Post Preview (~65% on desktop) */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="border-b border-border-grey py-3.5">
              <CardTitle>LinkedIn Draft</CardTitle>
              <CardDescription>Generated text preview</CardDescription>
            </CardHeader>
            <CardContent className="pt-5 whitespace-pre-line break-words text-body leading-relaxed text-near-black">
              {post.finalPost}
            </CardContent>
          </Card>

          {/* Review actions form panel at the bottom of the preview */}
          {canManage ? (
            <PostReviewActions
              clientId={clientId}
              postId={post.id}
              status={post.status}
            />
          ) : (
            <div className="rounded-control border border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
              Client Users can view this draft but cannot approve, reject, mark
              needs edit, or delete posts.
            </div>
          )}
        </div>

        {/* Right column: Post metadata (~35% on desktop) */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="border-b border-border-grey px-4 py-3.5">
              <CardTitle className="text-base font-semibold">Post History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 pb-3 pt-3 font-mono text-caption text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>Created:</span>
                <span>{formatUtcDateTime(post.createdAt)}</span>
              </div>
              {post.approvedAt && (
                <div className="flex justify-between gap-3 text-success">
                  <span>Approved:</span>
                  <span>{formatUtcDateTime(post.approvedAt)}</span>
                </div>
              )}
              {post.publishedAt && (
                <div className="flex justify-between gap-3 text-info">
                  <span>Published:</span>
                  <span>{formatUtcDateTime(post.publishedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {post.editNote ? (
            <div className="rounded-control border border-warning/30 bg-warning/5 px-4 py-3">
              <p className="text-caption font-medium uppercase tracking-wide text-warning-strong">
                Current Edit Note
              </p>
              <p className="mt-1 whitespace-pre-line break-words text-small text-near-black">
                {post.editNote}
              </p>
            </div>
          ) : null}

          <ReviewField
            icon={Repeat}
            iconClassName="text-brand-purple"
            label="Buyer Belief Shift"
            value={post.buyerBeliefShift}
          />
          <ReviewField
            icon={ShieldCheck}
            iconClassName="text-success"
            label="Proof Notes"
            value={post.proofNotes}
          />
          <ReviewField
            icon={AlertTriangle}
            iconClassName="text-danger"
            label="Risk Notes"
            value={post.riskNotes}
          />
          <ReviewField
            icon={Target}
            iconClassName="text-tertiary"
            label="CTA Intent"
            value={post.ctaIntent}
          />

          {sourceContext ? (
            <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span>Source Context Used</span>
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                />
              </summary>
              <div className="px-3 pb-3">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-control bg-soft-white p-3 font-mono text-caption text-near-black">
                  {sourceContext}
                </pre>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

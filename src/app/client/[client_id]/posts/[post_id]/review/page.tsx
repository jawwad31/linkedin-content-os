import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { getReviewPost, type ReviewPostStatus } from "@/features/posts/review/queries";
import { PostReviewActions } from "@/features/posts/review/post-review-actions";
import { canRoleManageWorkflowReview } from "@/lib/access/roles";
import { formatUtcDateTime } from "@/lib/format/date";
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
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <Card>
      <CardHeader className="py-3 px-4 border-b border-border-grey">
        <CardTitle className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 px-4 pb-3">
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/client/${clientId}/posts`}
          className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:text-near-black focus-visible:outline-none"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Posts
        </Link>
      </div>

      <PageHeader
        title="Post Review"
        description="Inspect and review this post's workflow status and content details."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Post Preview */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-border-grey py-3.5">
              <div>
                <CardTitle>LinkedIn Draft</CardTitle>
                <CardDescription>Generated text preview</CardDescription>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[post.status]}>
                {STATUS_LABELS[post.status] ?? post.status}
              </Badge>
            </CardHeader>
            <CardContent className="pt-5 whitespace-pre-line break-words text-body leading-relaxed text-near-black">
              {post.finalPost}
            </CardContent>
          </Card>

          {/* Linked Content Idea and Source context if available */}
          {post.idea && (
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border-grey">
                <CardTitle className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                  Linked Content Idea
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 px-4 pb-3 flex flex-col gap-1">
                <p className="break-words text-small font-medium text-near-black">
                  {post.idea.angle}
                </p>
                <p className="text-caption text-muted-foreground">
                  Source Type: {SOURCE_LABELS[post.idea.sourceType] ?? post.idea.sourceType}
                </p>
              </CardContent>
            </Card>
          )}

          {sourceContext && (
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border-grey">
                <CardTitle className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                  Source Context Used
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 px-4 pb-3">
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-caption text-near-black">
                  {sourceContext}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Review actions form panel at the bottom of the preview */}
          {canManage ? (
            <PostReviewActions
              clientId={clientId}
              postId={post.id}
              status={post.status}
            />
          ) : (
            <div className="rounded-control border border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
              Client Users can view details but cannot approve, reject, archive, or
              publish posts.
            </div>
          )}
        </div>

        {/* Right column: Post metadata & timestamps */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="py-3.5 px-4 border-b border-border-grey">
              <CardTitle className="text-base font-semibold">Post History</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-4 pb-3 flex flex-col gap-2 font-mono text-caption text-muted-foreground">
              <div className="flex justify-between">
                <span>Created:</span>
                <span>{formatUtcDateTime(post.createdAt)}</span>
              </div>
              {post.approvedAt && (
                <div className="flex justify-between text-success">
                  <span>Approved:</span>
                  <span>{formatUtcDateTime(post.approvedAt)}</span>
                </div>
              )}
              {post.publishedAt && (
                <div className="flex justify-between text-info">
                  <span>Published:</span>
                  <span>{formatUtcDateTime(post.publishedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <ReviewField label="CTA Intent" value={post.ctaIntent} />
          <ReviewField label="Buyer Belief Shift" value={post.buyerBeliefShift} />
          <ReviewField label="Proof Notes" value={post.proofNotes} />
          <ReviewField label="Risk Notes" value={post.riskNotes} />
          <ReviewField label="Current Edit Note" value={post.editNote} />
        </div>
      </div>
    </div>
  );
}

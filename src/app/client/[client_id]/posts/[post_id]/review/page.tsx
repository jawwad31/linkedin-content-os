import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { getReviewPost, type ReviewPostStatus } from "@/features/posts/review/queries";
import { PostDeleteButton } from "@/features/posts/review/post-delete-button";
import { PostReviewActions } from "@/features/posts/review/post-review-actions";
import { canRoleManageWorkflowReview } from "@/lib/access/roles";
import { formatUtcDate, formatUtcDateTime } from "@/lib/format/date";
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

/** Icon + title + flowing text. Used for fields that are a single free-text
 * value (not a guaranteed list), so we never invent chip/bullet structure
 * that the underlying content isn't guaranteed to have. */
function ReviewField({
  label,
  value,
  icon: Icon,
  iconClassName,
  labelClassName,
  tone,
}: {
  label: string;
  value: string | null;
  icon: LucideIcon;
  iconClassName: string;
  labelClassName?: string;
  tone?: "highlight";
}) {
  if (!value) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border-grey p-5",
        tone === "highlight" ? "bg-soft-white" : "bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <h3
          className={cn(
            "text-small font-semibold",
            labelClassName ?? "text-near-black",
          )}
        >
          {label}
        </h3>
      </div>
      <p className="whitespace-pre-line break-words text-small italic text-near-black">
        {value}
      </p>
    </div>
  );
}

/** Risk Notes: if the model already produced multiple newline-separated
 * risks, show each as its own flagged line; otherwise render as one
 * paragraph. This never splits on anything but real line breaks already in
 * the stored text, so it can't fabricate structure that isn't there. */
function RiskNotesCard({ value }: { value: string | null }) {
  if (!value) return null;

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-danger" />
        <h3 className="text-small font-semibold text-danger-strong">Risk Notes</h3>
      </div>
      {lines.length > 1 ? (
        <ul className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start gap-2 text-small text-near-black">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger"
              />
              <span className="break-words">{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="whitespace-pre-line break-words text-small text-near-black">
          {value}
        </p>
      )}
    </div>
  );
}

function CtaIntentCard({ value }: { value: string | null }) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-soft-white p-5">
      <div className="flex items-center gap-2">
        <Target aria-hidden="true" className="h-4 w-4 shrink-0 text-tertiary" />
        <h3 className="text-small font-semibold text-tertiary">CTA Intent</h3>
      </div>
      <div className="rounded-control border border-border-grey bg-white p-3">
        <p className="whitespace-pre-line break-words text-small text-near-black">
          {value}
        </p>
      </div>
    </div>
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

  const { post, client } = postResult;
  const canManage = canRoleManageWorkflowReview(role);
  const sourceContext = compactJson(post.sourceContextUsed);
  const displayName = client.founderName ?? client.name;

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
          <div className="rounded-card border border-border-grey bg-white p-6 shadow-xs">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-white"
              >
                {getInitials(displayName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-small font-semibold text-near-black">
                  {displayName}
                </p>
                <p className="flex items-center gap-1 text-caption text-muted-foreground">
                  {formatUtcDate(post.createdAt)}
                  <span aria-hidden="true">&middot;</span>
                  <Globe aria-hidden="true" className="h-3 w-3" />
                  <span>Draft preview</span>
                </p>
              </div>
            </div>
            <div className="mt-4 whitespace-pre-line break-words text-body leading-relaxed text-near-black">
              {post.finalPost}
            </div>
          </div>

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
            labelClassName="text-secondary-dark"
            label="Buyer Belief Shift"
            value={post.buyerBeliefShift}
            tone="highlight"
          />
          <ReviewField
            icon={ShieldCheck}
            iconClassName="text-success"
            labelClassName="text-success-strong"
            label="Proof Notes"
            value={post.proofNotes}
          />
          <RiskNotesCard value={post.riskNotes} />
          <CtaIntentCard value={post.ctaIntent} />

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

          <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-5">
            <div className="flex items-center gap-2">
              <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h3 className="text-small font-semibold text-near-black">Post History</h3>
            </div>
            <div className="flex flex-col gap-2 font-mono text-caption text-muted-foreground">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

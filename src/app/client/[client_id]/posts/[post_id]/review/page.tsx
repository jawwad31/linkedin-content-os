import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  LayoutTemplate,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { BeliefShiftDisplay } from "@/components/shared/belief-shift-display";
import { getReviewPost, type ReviewPostStatus } from "@/features/posts/review/queries";
import { PostDeleteButton } from "@/features/posts/review/post-delete-button";
import { PostReviewActions } from "@/features/posts/review/post-review-actions";
import {
  canRoleDraftPosts,
  canRoleManageWorkflowReview,
  canRoleReviewPosts,
} from "@/lib/access/roles";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { formatUtcDate, formatUtcDateTime } from "@/lib/format/date";
import { getServerUser } from "@/lib/supabase/session";
import type { FormatRecommendation } from "@/lib/ai/playbooks/contracts";
import {
  QA_WARNING_LABELS,
  type QaWarningCode,
} from "@/lib/ai/playbooks/qa-warnings";

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

const FORMAT_LABELS: Record<FormatRecommendation["primaryFormat"], string> = {
  text: "Text post",
  carousel: "Carousel",
  video: "Video",
  poll: "Poll",
  newsletter: "Newsletter",
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

/**
 * AI review is advisory — it never prevents a draft from being created. These
 * flags sit above the post body, never inside a disclosure, because they are
 * the only signal the reviewer gets before approving.
 */
function QaWarningsBanner({ codes }: { codes: QaWarningCode[] }) {
  if (codes.length === 0) return null;

  return (
    <div className="rounded-card border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-warning-strong"
        />
        <h2 className="text-small font-semibold text-warning-strong">
          AI review flagged {codes.length}{" "}
          {codes.length === 1 ? "thing" : "things"} to check
        </h2>
      </div>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-9 text-small text-near-black">
        {codes.map((code) => (
          <li key={code}>{QA_WARNING_LABELS[code]}</li>
        ))}
      </ul>
      <p className="mt-2 pl-9 text-caption text-muted-foreground">
        These are advisory. Read the draft and decide before approving.
      </p>
    </div>
  );
}

function BuyerBeliefShiftCard({ value }: { value: string | null }) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-soft-white p-5">
      <div className="flex items-center gap-2">
        <Repeat aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-purple" />
        <h3 className="text-small font-semibold text-secondary-dark">
          Buyer Belief Shift
        </h3>
      </div>
      <BeliefShiftDisplay value={value} />
    </div>
  );
}

/** Breaks the free-text proof_notes value onto one line per sentence so it
 * reads as short scannable statements instead of one dense block. This only
 * adds line breaks at real sentence boundaries already in the text - no
 * words are changed, reordered, or dropped. */
function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function ProofNotesCard({ value }: { value: string | null }) {
  if (!value) return null;

  const sentences = splitSentences(value);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-success-strong" />
        <h3 className="text-small font-semibold text-near-black">Proof Notes</h3>
      </div>
      <div className="flex flex-col gap-2">
        {sentences.map((sentence, index) => (
          <p
            key={index}
            className="whitespace-pre-line break-words text-small leading-relaxed text-near-black"
          >
            {sentence}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Splits risk_notes into one bullet per risk. Prefers real newlines the
 * model already wrote; when the model instead wrote flowing prose, falls
 * back to splitting on real sentence boundaries. Either way this only
 * breaks the existing text at boundaries already present in it - nothing is
 * changed, reordered, or dropped. */
function splitRiskLines(value: string): string[] {
  const byNewline = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (byNewline.length > 1) return byNewline;

  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function RiskNotesCard({ value }: { value: string | null }) {
  if (!value) return null;

  const lines = splitRiskLines(value);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-danger-strong" />
        <h3 className="text-small font-semibold text-near-black">Risk Notes</h3>
      </div>
      <ul className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-2 text-small text-near-black">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-strong"
            />
            <span className="break-words">{line}</span>
          </li>
        ))}
      </ul>
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

function FormatRecommendationCard({
  value,
}: {
  value: FormatRecommendation | null;
}) {
  if (!value) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-grey bg-soft-white p-5">
      <div className="flex items-center gap-2">
        <LayoutTemplate
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-brand-purple"
        />
        <h3 className="text-small font-semibold text-secondary-dark">
          Suggested Next Format
        </h3>
      </div>
      <div>
        <Badge variant="outline">{FORMAT_LABELS[value.primaryFormat]}</Badge>
        <p className="mt-2 text-small leading-relaxed text-near-black">
          {value.rationale}
        </p>
      </div>
      {value.alternativeFormats.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          Alternatives:{" "}
          {value.alternativeFormats
            .map((format) => FORMAT_LABELS[format])
            .join(", ")}
        </p>
      ) : null}
      {value.adaptationNotes.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-caption font-medium text-secondary-dark">
            Adaptation notes
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-caption text-muted-foreground">
            {value.adaptationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Advisory only. The saved draft remains a text post.
      </p>
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

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
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
  const canReview = canRoleReviewPosts(access.role, access.permissions);
  const canRedraft = canRoleDraftPosts(access.role, access.permissions);
  const canDelete = canRoleManageWorkflowReview(access.role);
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
            {post.funnelStage ? (
              <Badge variant="outline" className="text-brand-purple border-brand-purple/30">
                {post.funnelStage} Stage
              </Badge>
            ) : null}
            {post.postType ? (
              <Badge variant="outline">
                {post.postType.replace(/_/g, " ")}
              </Badge>
            ) : null}
            <span className="text-caption font-mono text-muted-foreground">
              v{post.draftVersion ?? 1}
            </span>
          </div>
          {post.draftVersion && post.approvedDraftVersion && post.draftVersion !== post.approvedDraftVersion ? (
            <div className="mt-2 flex items-center gap-2 rounded-control bg-warning/10 border border-warning/30 px-3 py-2 text-caption text-warning-strong font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Draft updated after approval. Renewed review is required before publishing.</span>
            </div>
          ) : null}
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
        {canDelete ? (
          <PostDeleteButton clientId={clientId} post={post} redirectToPosts />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13fr_7fr] lg:items-start">
        {/* Left column: Post Preview (~65% on desktop) */}
        <div className="flex min-w-0 flex-col gap-4">
          <QaWarningsBanner codes={post.qaWarnings} />

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
          {canReview || canRedraft ? (
            <PostReviewActions
              clientId={clientId}
              postId={post.id}
              status={post.status}
              canReview={canReview}
              canRedraft={canRedraft}
            />
          ) : (
            <div className="rounded-control border border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
              Your Account access does not include Post review actions.
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

          <BuyerBeliefShiftCard value={post.buyerBeliefShift} />
          <ProofNotesCard value={post.proofNotes} />
          <RiskNotesCard value={post.riskNotes} />
          <CtaIntentCard value={post.ctaIntent} />
          <FormatRecommendationCard value={post.formatRecommendation} />

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
                <div className="flex justify-between gap-3 text-success-strong">
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

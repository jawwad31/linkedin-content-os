import { CheckCircle2, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReviewPost } from "@/features/posts/review/queries";
import {
  canRoleManageWorkflowReview,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { PublishPostActions } from "./publish-post-actions";

const SOURCE_LABELS: Record<string, string> = {
  founder_experience: "Founder Experience",
  trend_card: "TrendCard",
  trend_reaction: "Trend Reaction",
};

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return formatUtcDate(value);
}

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

function PublishField({
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

function PublishPostCard({
  clientId,
  role,
  post,
  variant,
}: {
  clientId: string;
  role: EffectiveClientRole;
  post: ReviewPost;
  variant: "ready" | "published";
}) {
  const canManage = canRoleManageWorkflowReview(role);
  const canMarkPublished = variant === "ready" && canManage;

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-4 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={variant === "ready" ? "success" : "info"}>
              {variant === "ready" ? "Approved" : "Published"}
            </Badge>
            <span className="font-mono text-caption text-muted-foreground">
              {variant === "ready"
                ? `Approved ${formatDate(post.approvedAt)}`
                : `Published ${formatDate(post.publishedAt)}`}
            </span>
          </div>
          <h3 className="break-words font-heading text-card-title text-near-black">
            {post.hook ?? "LinkedIn post"}
          </h3>
        </div>

        <PublishPostActions
          clientId={clientId}
          postId={post.id}
          postText={post.finalPost}
          canMarkPublished={canMarkPublished}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="min-w-0 rounded-control border border-border-grey bg-white p-4">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Post Text
          </p>
          <div className="mt-3 whitespace-pre-line break-words text-body leading-7 text-near-black">
            {post.finalPost}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <PublishField label="CTA intent" value={post.ctaIntent} />
          <PublishField
            label="Buyer belief shift"
            value={post.buyerBeliefShift}
          />
          <PublishField label="Proof notes" value={post.proofNotes} />
          <PublishField label="Risk notes" value={post.riskNotes} />
          <div className="min-w-0 rounded-control border border-border-grey bg-soft-white px-3 py-2">
            <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
              Approved
            </p>
            <p className="mt-1 font-mono text-caption text-near-black">
              {formatDate(post.approvedAt)}
            </p>
          </div>
          {variant === "published" ? (
            <div className="min-w-0 rounded-control border border-border-grey bg-soft-white px-3 py-2">
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Published
              </p>
              <p className="mt-1 font-mono text-caption text-near-black">
                {formatDate(post.publishedAt)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <SourceMetadata post={post} />
    </article>
  );
}

function PublishSection({
  clientId,
  role,
  title,
  description,
  emptyTitle,
  emptyDescription,
  posts,
  variant,
}: {
  clientId: string;
  role: EffectiveClientRole;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  posts: ReviewPost[];
  variant: "ready" | "published";
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-section-title text-near-black">
          {title}
        </h2>
        <p className="mt-1 text-small text-muted-foreground">{description}</p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-card border border-border-grey bg-white p-6">
          <EmptyState
            icon={variant === "ready" ? ClipboardList : CheckCircle2}
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PublishPostCard
              key={post.id}
              clientId={clientId}
              role={role}
              post={post}
              variant={variant}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function PublishQueuePanel({
  clientId,
  role,
  approvedPosts,
  publishedPosts,
}: {
  clientId: string;
  role: EffectiveClientRole;
  approvedPosts: ReviewPost[];
  publishedPosts: ReviewPost[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <PublishSection
        clientId={clientId}
        role={role}
        title="Ready to Publish"
        description="Approved posts ready to copy into LinkedIn manually."
        emptyTitle="No approved posts ready"
        emptyDescription="Approved posts will appear here when they are ready to copy into LinkedIn."
        posts={approvedPosts}
        variant="ready"
      />

      <PublishSection
        clientId={clientId}
        role={role}
        title="Published History"
        description="Posts marked as published after manual posting."
        emptyTitle="No published posts yet"
        emptyDescription="Posts you mark as published will appear here."
        posts={publishedPosts}
        variant="published"
      />
    </div>
  );
}

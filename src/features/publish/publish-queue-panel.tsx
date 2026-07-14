import { ChevronRight, History, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReviewPost } from "@/features/posts/review/queries";
import {
  canRoleManageWorkflowReview,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { PublishPostActions } from "./publish-post-actions";

const HISTORY_PREVIEW_LENGTH = 220;

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return formatUtcDate(value);
}

/** Ready-to-publish cards: post text is the dominant element, with the
 * belief shift as one quiet supporting line underneath - CTA/proof/risk and
 * source metadata belong to Post Review, not the distribution queue. */
function ReadyToPublishCard({
  clientId,
  role,
  post,
}: {
  clientId: string;
  role: EffectiveClientRole;
  post: ReviewPost;
}) {
  const canMarkPublished = canRoleManageWorkflowReview(role);

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Approved</Badge>
        <span className="font-mono text-caption text-muted-foreground">
          Approved {formatDate(post.approvedAt)}
        </span>
      </div>

      <div className="whitespace-pre-line break-words text-body leading-relaxed text-near-black">
        {post.finalPost}
      </div>

      {post.buyerBeliefShift ? (
        <p className="whitespace-pre-line break-words text-small italic text-muted-foreground">
          {post.buyerBeliefShift}
        </p>
      ) : null}

      <PublishPostActions
        clientId={clientId}
        postId={post.id}
        postText={post.finalPost}
        canMarkPublished={canMarkPublished}
      />
    </article>
  );
}

/** Published History is intentionally quieter than the ready queue: smaller
 * type, muted tonal background, and long posts collapse behind a native
 * <details> disclosure so the list stays scannable without hiding the
 * status/date, which remain outside the collapsible content. */
function PublishedHistoryText({ text }: { text: string }) {
  if (text.length <= HISTORY_PREVIEW_LENGTH) {
    return (
      <p className="whitespace-pre-line break-words text-small text-near-black">
        {text}
      </p>
    );
  }

  const preview = text.slice(0, HISTORY_PREVIEW_LENGTH).trim();

  return (
    <details className="group">
      <summary className="cursor-pointer select-none list-none marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="whitespace-pre-line break-words text-small text-near-black group-open:hidden">
          {preview}&hellip;
        </span>
        <span className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand-orange">
          <span className="group-open:hidden">Show more</span>
          <span className="hidden group-open:inline">Show less</span>
          <ChevronRight
            aria-hidden="true"
            className="h-3 w-3 transition-transform duration-200 group-open:rotate-90"
          />
        </span>
      </summary>
      <p className="mt-2 whitespace-pre-line break-words text-small text-near-black">
        {text}
      </p>
    </details>
  );
}

function PublishedHistoryCard({
  clientId,
  post,
}: {
  clientId: string;
  post: ReviewPost;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-control border border-border-grey bg-soft-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">Published</Badge>
        <span className="font-mono text-caption text-muted-foreground">
          {formatDate(post.publishedAt)}
        </span>
      </div>

      <PublishedHistoryText text={post.finalPost} />

      <PublishPostActions
        clientId={clientId}
        postId={post.id}
        postText={post.finalPost}
        canMarkPublished={false}
      />
    </article>
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
  if (approvedPosts.length === 0 && publishedPosts.length === 0) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6">
        <EmptyState
          icon={Send}
          title="Nothing to publish yet"
          description="Approve a post in Post Review to send it here for manual publishing."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Send aria-hidden="true" className="h-5 w-5 text-brand-orange" />
          <h2 className="font-heading text-section-title text-near-black">
            Ready to Publish
          </h2>
          {approvedPosts.length > 0 ? (
            <Badge variant="accent-orange">
              {approvedPosts.length} Pending
            </Badge>
          ) : null}
        </div>

        {approvedPosts.length === 0 ? (
          <div className="rounded-card border border-border-grey bg-white p-6">
            <EmptyState
              icon={Send}
              title="No approved posts ready"
              description="Approved posts will appear here when they are ready to copy into LinkedIn."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {approvedPosts.map((post) => (
              <ReadyToPublishCard
                key={post.id}
                clientId={clientId}
                role={role}
                post={post}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <History aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-heading text-section-title text-near-black">
            Published History
          </h2>
        </div>

        {publishedPosts.length === 0 ? (
          <div className="rounded-card border border-border-grey bg-white p-6">
            <EmptyState
              icon={History}
              title="No published posts yet"
              description="Posts you mark as published will appear here."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {publishedPosts.map((post) => (
              <PublishedHistoryCard key={post.id} clientId={clientId} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

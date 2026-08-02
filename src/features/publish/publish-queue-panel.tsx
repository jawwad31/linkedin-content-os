import { History, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReviewPost } from "@/features/posts/review/queries";
import {
  canRolePublishPosts,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { OpenFullPostButton } from "./open-full-post-dialog";
import { PublishPostActions } from "./publish-post-actions";

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return formatUtcDate(value);
}

/** Ready-to-publish cards: post text is the dominant element, with the
 * belief shift as one quiet supporting line underneath - CTA/proof/risk and
 * source metadata belong to Post Review, not the distribution queue. Long
 * text clamps to 4 lines here; "Open Full Post" reveals the rest. */
function ReadyToPublishCard({
  clientId,
  role,
  permissions,
  post,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  post: ReviewPost;
}) {
  const canMarkPublished = canRolePublishPosts(role, permissions);
  const approvedLabel = `Approved ${formatDate(post.approvedAt)}`;

  return (
    <article className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Approved</Badge>
        <span className="font-mono text-caption text-muted-foreground">
          {approvedLabel}
        </span>
      </div>

      <div className="line-clamp-4 whitespace-pre-line break-words text-body leading-relaxed text-near-black">
        {post.finalPost}
      </div>

      {post.buyerBeliefShift ? (
        <p className="line-clamp-2 whitespace-pre-line break-words text-small italic text-muted-foreground">
          {post.buyerBeliefShift}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <OpenFullPostButton
          postText={post.finalPost}
          badgeLabel="Approved"
          badgeVariant="success"
          dateLabel={approvedLabel}
        />
        <PublishPostActions
          clientId={clientId}
          postId={post.id}
          postText={post.finalPost}
          canMarkPublished={canMarkPublished}
        />
      </div>
    </article>
  );
}

/** Published History is intentionally quieter than the ready queue: smaller
 * type, muted tonal background, and long text clamps to 3 lines - "Open Full
 * Post" reveals the rest without hiding status/date, which stay outside the
 * clamp entirely. */
function PublishedHistoryCard({
  clientId,
  post,
}: {
  clientId: string;
  post: ReviewPost;
}) {
  const publishedLabel = `Published ${formatDate(post.publishedAt)}`;

  return (
    <article className="flex flex-col gap-3 rounded-control border border-border-grey bg-soft-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">Published</Badge>
        <span className="font-mono text-caption text-muted-foreground">
          {publishedLabel}
        </span>
      </div>

      <p className="line-clamp-3 whitespace-pre-line break-words text-small text-near-black">
        {post.finalPost}
      </p>

      <div className="flex flex-col gap-2">
        <OpenFullPostButton
          postText={post.finalPost}
          badgeLabel="Published"
          badgeVariant="info"
          dateLabel={publishedLabel}
        />
        <PublishPostActions
          clientId={clientId}
          postId={post.id}
          postText={post.finalPost}
          canMarkPublished={false}
        />
      </div>
    </article>
  );
}

export function PublishQueuePanel({
  clientId,
  role,
  permissions,
  approvedPosts,
  publishedPosts,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
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
                permissions={permissions}
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

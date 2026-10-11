"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatShortDate } from "@/features/calendar/dates";
import type { DraftingEntry } from "@/features/calendar/queries";
import type { ReviewPost } from "@/features/posts/review/queries";

const noteCount = (count: number) => `${count} QA ${count === 1 ? "note" : "notes"}`;

export function postTitle(post: Pick<ReviewPost, "hook" | "finalPost">): string {
  const line = (post.hook ?? post.finalPost).replace(/\s+/g, " ").trim();
  if (!line) return "Untitled post";
  return line.length > 100 ? `${line.slice(0, 100)}…` : line;
}

/** What the post needs, in plain words. */
export function reviewStatusLine(
  post: Pick<ReviewPost, "status" | "draftVersion" | "qaWarnings">,
): string {
  if (post.status === "needs_edit") return "Edits requested";
  if ((post.draftVersion ?? 1) > 1) return "Edited · needs approval";
  return post.qaWarnings.length > 0
    ? `Draft ready · ${noteCount(post.qaWarnings.length)}`
    : "Draft ready";
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={`${title}, ${count}`}>
      <h2 className="text-body font-semibold text-near-black">
        {title} <span className="font-normal text-muted-foreground">· {count}</span>
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Row({ title, detail, action }: { title: string; detail: string; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-grey bg-white p-4">
      <div className="min-w-0">
        <p className="break-words text-small font-medium text-near-black">{title}</p>
        <p className="text-caption text-muted-foreground">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * What needs a person, in the order it is usually done: posts to review, posts ready to
 * publish by hand, and entries a draft is being written for.
 */
export function NeedsYouPanel({
  clientId,
  posts,
  drafting,
  canReview,
}: {
  clientId: string;
  posts: ReviewPost[];
  drafting: DraftingEntry[];
  canReview: boolean;
}) {
  // Posts arrive newest first; review the longest-waiting one first.
  const toReview = posts
    .filter((post) => post.status === "review" || post.status === "needs_edit")
    .reverse();
  const ready = posts.filter((post) => post.status === "approved");
  const link = (post: ReviewPost) => `/client/${clientId}/posts/${post.id}/review`;

  if (toReview.length === 0 && ready.length === 0 && drafting.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing needs you right now"
        description="Create a post from a Content Bank entry, or add an entry to the calendar."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {toReview.length > 0 && canReview ? (
        <div>
          <Link href={link(toReview[0])} className={buttonVariants({ variant: "brand", size: "sm" })}>
            Review next post
          </Link>
        </div>
      ) : null}

      {toReview.length > 0 ? (
        <Section title="Review" count={toReview.length}>
          {toReview.map((post) => (
            <Row
              key={post.id}
              title={postTitle(post)}
              detail={reviewStatusLine(post)}
              action={
                <Link href={link(post)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Review
                </Link>
              }
            />
          ))}
        </Section>
      ) : null}

      {ready.length > 0 ? (
        <Section title="Ready to publish" count={ready.length}>
          {ready.map((post) => (
            <Row
              key={post.id}
              title={postTitle(post)}
              detail={`Approved version ${post.approvedDraftVersion ?? post.draftVersion ?? 1}`}
              action={
                <Link href={link(post)} className={buttonVariants({ variant: "brand", size: "sm" })}>
                  Publish
                </Link>
              }
            />
          ))}
        </Section>
      ) : null}

      {drafting.length > 0 ? (
        <Section title="In progress" count={drafting.length}>
          {drafting.map((entry) => (
            <Row
              key={entry.slotId}
              title={entry.title}
              detail={entry.date ? `Drafting · ${formatShortDate(entry.date)}` : "Drafting"}
              action={
                <Link
                  href={`/client/${clientId}/calendar${entry.date ? `?month=${entry.date.slice(0, 7)}` : ""}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  View on calendar
                </Link>
              }
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

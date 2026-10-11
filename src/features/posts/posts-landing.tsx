"use client";

import { useState } from "react";

import { SegmentedNavigation } from "@/components/ui/segmented-navigation";
import type { DraftingEntry } from "@/features/calendar/queries";
import { NeedsYouPanel } from "@/features/posts/needs-you-panel";
import { PostsView } from "@/features/posts/posts-view";
import type { ReviewPost } from "@/features/posts/review/queries";
import type { EffectiveClientRole } from "@/lib/access/roles";

type View = "needs_you" | "all";

/** Posts opens on what needs a person; "All posts" is the full list with its tabs. */
export function PostsLanding({
  clientId,
  posts,
  drafting,
  role,
  canReview,
}: {
  clientId: string;
  posts: ReviewPost[];
  drafting: DraftingEntry[];
  role: EffectiveClientRole;
  canReview: boolean;
}) {
  const [view, setView] = useState<View>("needs_you");
  const needsCount =
    posts.filter((post) => ["review", "needs_edit", "approved"].includes(post.status)).length +
    drafting.length;

  return (
    <div className="flex flex-col gap-6">
      <SegmentedNavigation
        items={[
          { id: "needs_you" as View, label: "Needs you", count: needsCount },
          { id: "all" as View, label: "All posts", count: posts.length },
        ]}
        activeId={view}
        onChange={setView}
        className="self-start"
      />
      {view === "needs_you" ? (
        <NeedsYouPanel clientId={clientId} posts={posts} drafting={drafting} canReview={canReview} />
      ) : (
        <PostsView clientId={clientId} posts={posts} role={role} />
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { ListError } from "@/components/ui/list-error";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { cannotReason, missingPermissions } from "@/lib/access/permission-copy";
import { canRoleReviewPosts } from "@/lib/access/roles";
import { getReviewPosts } from "@/features/posts/review/queries";
import { PostsLanding } from "@/features/posts/posts-landing";
import { getDraftingEntries } from "@/features/calendar/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client_id: clientId } = await params;
  const query = await searchParams;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  // Create post is its own screen. Links made before that (a Content Bank entry in the
  // URL) land there with the same entry selected.
  if (query.sourceId !== undefined || query.sourceType !== undefined) {
    const forward = new URLSearchParams();
    for (const key of ["sourceType", "sourceId"] as const) {
      const value = query[key];
      if (typeof value === "string") forward.set(key, value);
    }
    redirect(`/client/${clientId}/posts/new?${forward.toString()}`);
  }

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this client.
      </div>
    );
  }

  const [postsResult, drafting] = await Promise.all([getReviewPosts(clientId), getDraftingEntries(clientId)]);
  const createReason = cannotReason(
    "create posts",
    missingPermissions(access.role, access.permissions, ["ideas_manage", "posts_draft"]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="What needs you first: posts to review, posts ready to publish by hand, and drafts in progress."
        action={createReason === null ? (
          <Link href={`/client/${clientId}/posts/new`} className={buttonVariants({ variant: "brand" })}>Create post</Link>
        ) : (
          <span className="inline-flex h-9 cursor-not-allowed items-center rounded-control bg-surface-sunken px-4 text-small font-medium text-muted-foreground" aria-disabled="true">Create post</span>
        )}
      />
      {createReason ? <p className="text-small text-muted-foreground">{createReason}</p> : null}

      {postsResult.ok ? (
        <PostsLanding
          clientId={clientId}
          posts={postsResult.posts}
          drafting={drafting}
          role={access.role}
          canReview={canRoleReviewPosts(access.role, access.permissions)}
        />
      ) : (
        <ListError />
      )}
    </div>
  );
}

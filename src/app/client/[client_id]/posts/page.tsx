import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/lib/access/client-access";
import { getReviewPosts } from "@/features/posts/review/queries";
import { PostsView } from "@/features/posts/posts-view";
import { getServerUser } from "@/lib/supabase/session";

export default async function PostsPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  if (!role) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this client.
      </div>
    );
  }

  const postsResult = await getReviewPosts(clientId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="Review, edit, approve, reject and inspect generated LinkedIn posts."
      />

      {postsResult.ok ? (
        <PostsView clientId={clientId} posts={postsResult.posts} role={role} />
      ) : (
        <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
          We could not load post drafts. Please try again.
        </div>
      )}
    </div>
  );
}

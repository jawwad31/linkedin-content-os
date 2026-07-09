import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { PostReviewPanel } from "@/features/posts/review/post-review-panel";
import { getReviewPosts } from "@/features/posts/review/queries";
import { getServerUser } from "@/lib/supabase/session";

export default async function PublishPage({
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
  const postsResult = role ? await getReviewPosts(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Post Review"
        description="Review generated LinkedIn drafts before approval. Publishing is not enabled yet."
      />

      {role && postsResult ? (
        postsResult.ok ? (
          <PostReviewPanel
            clientId={clientId}
            role={role}
            posts={postsResult.posts}
          />
        ) : (
          <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
            We could not load post drafts. Please try again.
          </div>
        )
      ) : (
        <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
          You do not have access to this client.
        </div>
      )}
    </div>
  );
}

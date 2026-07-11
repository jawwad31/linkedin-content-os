import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { getReviewPosts } from "@/features/posts/review/queries";
import { PublishQueuePanel } from "@/features/publish/publish-queue-panel";
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
  const posts = postsResult?.ok ? postsResult.posts : [];
  const approvedPosts = posts.filter((post) => post.status === "approved");
  const publishedPosts = posts.filter((post) => post.status === "published");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Publish"
        description="Approved posts ready for manual publishing, and published history."
      />

      {role && postsResult ? (
        postsResult.ok ? (
          <div className="flex flex-col gap-8">
            <PublishQueuePanel
              clientId={clientId}
              role={role}
              approvedPosts={approvedPosts}
              publishedPosts={publishedPosts}
            />
          </div>
        ) : (
          <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger">
            We could not load approved posts. Please try again.
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

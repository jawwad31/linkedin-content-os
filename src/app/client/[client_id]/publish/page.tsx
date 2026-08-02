import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getReviewPosts } from "@/features/posts/review/queries";
import { PublishQueuePanel } from "@/features/publish/publish-queue-panel";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";

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

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  const role = access?.role ?? null;
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
          <PublishQueuePanel
            clientId={clientId}
            role={role}
            permissions={access?.permissions ?? []}
            approvedPosts={approvedPosts}
            publishedPosts={publishedPosts}
          />
        ) : (
          <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
            We could not load approved posts. Please try again.
          </div>
        )
      ) : (
        <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
          You do not have access to this client.
        </div>
      )}
    </div>
  );
}

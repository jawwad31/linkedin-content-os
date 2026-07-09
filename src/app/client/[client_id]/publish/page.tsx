import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { PostReviewPanel } from "@/features/posts/review/post-review-panel";
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
  const reviewPosts = posts.filter(
    (post) =>
      post.status === "review" ||
      post.status === "needs_edit" ||
      post.status === "rejected",
  );
  const approvedPosts = posts.filter((post) => post.status === "approved");
  const publishedPosts = posts.filter((post) => post.status === "published");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Publish"
        description="Review generated posts, copy approved posts into LinkedIn, and track published history."
      />

      {role && postsResult ? (
        postsResult.ok ? (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-section-title text-near-black">
                  Post Review
                </h2>
                <p className="mt-1 text-small text-muted-foreground">
                  Review generated LinkedIn drafts before approval.
                </p>
              </div>

              <PostReviewPanel
                clientId={clientId}
                role={role}
                posts={reviewPosts}
              />
            </section>

            <PublishQueuePanel
              clientId={clientId}
              role={role}
              approvedPosts={approvedPosts}
              publishedPosts={publishedPosts}
            />
          </div>
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

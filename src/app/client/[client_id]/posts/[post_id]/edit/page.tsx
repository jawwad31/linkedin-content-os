import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PostEditor } from "@/features/posts/review/post-editor";
import { getReviewPost } from "@/features/posts/review/queries";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { canRoleReviewPosts } from "@/lib/access/roles";
import { getServerUser } from "@/lib/supabase/session";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ client_id: string; post_id: string }>;
}) {
  const { client_id: clientId, post_id: postId } = await params;
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this account.
      </div>
    );
  }

  const reviewHref = `/client/${clientId}/posts/${postId}/review`;
  const back = (
    <Link
      href={reviewHref}
      className="inline-flex items-center gap-1.5 text-small text-muted-foreground hover:text-near-black focus-visible:outline-none"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to the post
    </Link>
  );

  const result = await getReviewPost(clientId, postId);
  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <EmptyState
          icon={FileText}
          title="This post is not available"
          description="It may have been deleted, or you might not have access to it."
        />
      </div>
    );
  }

  const { post } = result;
  const version = post.draftVersion ?? 1;
  const canEdit = canRoleReviewPosts(access.role, access.permissions) && post.status !== "published" && post.status !== "rejected";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {back}
      <div>
        <h1 className="text-page-title-mobile font-heading font-semibold text-near-black sm:text-page-title">
          Editing version {version}
        </h1>
        <p className="mt-1 text-small text-muted-foreground">Plain text. Nothing is posted anywhere.</p>
      </div>
      {canEdit ? (
        <PostEditor
          clientId={clientId}
          postId={postId}
          initialText={post.finalPost}
          version={version}
          approved={post.status === "approved"}
        />
      ) : (
        <p className="rounded-control border border-border-grey bg-white px-4 py-3 text-small text-muted-foreground">
          {post.status === "published" || post.status === "rejected"
            ? "A published or rejected post cannot be edited."
            : "You cannot edit posts. Ask an account admin to add the Review capability."}
        </p>
      )}
    </div>
  );
}

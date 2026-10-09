import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { canRoleManageIdeas, canRoleDraftPosts, canRoleManageFounderExperiences } from "@/lib/access/roles";
import { StandalonePostForm } from "@/features/posts/generate/standalone-post-form";
import type { StandaloneDocumentOption } from "@/features/posts/generate/standalone-brief-schema";
import { createClient } from "@/lib/supabase/server";
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

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this client.
      </div>
    );
  }

  const postsResult = await getReviewPosts(clientId);
  const canCreate = canRoleManageIdeas(access.role, access.permissions) && canRoleDraftPosts(access.role, access.permissions);
  let documents: StandaloneDocumentOption[] = [];
  let documentsUnavailable = false;
  if (canCreate) {
    const supabase = await createClient();
    const result = await supabase.from("client_documents").select("id,filename,version")
      .eq("client_id", clientId).eq("purpose", "source_material")
      .eq("status", "ready").is("deleted_at", null)
      .order("created_at", { ascending: false }).returns<StandaloneDocumentOption[]>();
    documents = result.data ?? [];
    documentsUnavailable = !!result.error;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="Review, edit, approve, reject and inspect generated LinkedIn posts."
      />

      {canCreate ? <StandalonePostForm clientId={clientId} documents={documents} documentsUnavailable={documentsUnavailable}
        canUpload={canRoleManageFounderExperiences(access.role, access.permissions)} /> : null}

      {postsResult.ok ? (
        <PostsView clientId={clientId} posts={postsResult.posts} role={access.role} />
      ) : (
        <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
          We could not load post drafts. Please try again.
        </div>
      )}
    </div>
  );
}

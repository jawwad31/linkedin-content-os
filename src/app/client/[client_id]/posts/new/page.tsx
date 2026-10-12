import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { cannotReason, missingPermissions } from "@/lib/access/permission-copy";
import { canRoleManageFounderExperiences } from "@/lib/access/roles";
import { StandalonePostForm } from "@/features/posts/generate/standalone-post-form";
import { loadStandaloneSources } from "@/features/posts/generate/standalone-source";
import { getServerUser } from "@/lib/supabase/session";

export default async function CreatePostPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client_id: clientId } = await params;
  const query = await searchParams;
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this client.
      </div>
    );
  }

  // Creating a post needs both Manage ideas and Draft posts. Without them the form
  // stays visible and Draft post is disabled with one reason line (wireframe s8).
  const missing = missingPermissions(access.role, access.permissions, ["ideas_manage", "posts_draft"]);
  const draftBlockedReason = cannotReason("draft posts", missing);
  const sources = draftBlockedReason === null
    ? await loadStandaloneSources(clientId, query)
    : { documents: [], documentsUnavailable: false, initialContentBankSource: null, initialSourceError: null };
  const { initialContentBankSource, initialSourceError } = sources;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Posts", href: `/client/${clientId}/posts` },
          { label: "Create post" },
        ]}
      />
      <StandalonePostForm
        key={initialContentBankSource ? `${initialContentBankSource.sourceType}:${initialContentBankSource.id}` : initialSourceError ? "invalid-content-bank-source" : "standalone"}
        clientId={clientId}
        documents={sources.documents}
        documentsUnavailable={sources.documentsUnavailable}
        canUpload={canRoleManageFounderExperiences(access.role, access.permissions)}
        initialContentBankSource={initialContentBankSource}
        initialSourceError={initialSourceError}
        draftBlockedReason={draftBlockedReason}
      />
    </div>
  );
}

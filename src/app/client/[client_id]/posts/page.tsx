import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { canRoleManageIdeas, canRoleDraftPosts, canRoleManageFounderExperiences, canRoleReviewPosts } from "@/lib/access/roles";
import { StandalonePostForm } from "@/features/posts/generate/standalone-post-form";
import {
  standaloneContentBankSourceSchema,
  type StandaloneContentBankOption,
  type StandaloneDocumentOption,
} from "@/features/posts/generate/standalone-brief-schema";
import { createClient } from "@/lib/supabase/server";
import { getReviewPosts } from "@/features/posts/review/queries";
import { PostsLanding } from "@/features/posts/posts-landing";
import { getDraftingEntries } from "@/features/calendar/queries";
import { getServerUser } from "@/lib/supabase/session";
import { getContentBankEntry } from "@/features/content-bank/queries";
import { CONTENT_BANK_CATEGORY_LABELS, type ContentBankEntry } from "@/features/content-bank/schemas";
import { getContentBankPostEligibility } from "@/features/content-bank/post-eligibility";

function contentBankOption(entry: ContentBankEntry): StandaloneContentBankOption {
  const eligibility = getContentBankPostEligibility(entry);
  const details = entry.sourceType === "content_resource"
    ? [
        { label: "Resource type", value: entry.resourceType },
        { label: "Description", value: entry.description },
        { label: "Problem solved", value: entry.problemSolved },
        { label: "Target use case", value: entry.targetUseCase },
        { label: "Comment keyword", value: entry.keyword },
        { label: "Delivery URL", value: entry.deliveryUrl },
        { label: "Manual delivery instructions", value: entry.deliveryInstructions },
        { label: "Raw notes", value: entry.rawNotes },
      ]
    : [
        { label: entry.entryType === "trend_reaction" ? "Your take" : "Takeaway", value: entry.takeaway ?? entry.whatWasLearned },
        { label: "What happened / proof", value: entry.whatHappened },
        { label: "What changed", value: entry.whatChanged },
        { label: "Why it matters", value: entry.whyItMatters },
        { label: "Raw notes", value: entry.rawNotes },
      ];

  return {
    id: entry.id,
    sourceType: entry.sourceType,
    entryType: entry.entryType,
    title: entry.title,
    categoryLabel: CONTENT_BANK_CATEGORY_LABELS[entry.category],
    readiness: entry.readiness,
    usageStatus: entry.usageStatus,
    allowReuse: entry.allowReuse,
    eligible: eligibility.eligible,
    eligibilityMessage: eligibility.message,
    canOffer: entry.sourceType === "content_resource" && Boolean(
      entry.active && entry.commentGateApproved && entry.keyword &&
      (entry.deliveryUrl || entry.deliveryInstructions),
    ),
    details: details.flatMap(({ label, value }) =>
      typeof value === "string" && value.trim()
        ? [{ label, value }]
        : []),
  };
}

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

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  if (!access) {
    return (
      <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
        You do not have access to this client.
      </div>
    );
  }

  const [postsResult, drafting] = await Promise.all([getReviewPosts(clientId), getDraftingEntries(clientId)]);
  const canCreate = canRoleManageIdeas(access.role, access.permissions) && canRoleDraftPosts(access.role, access.permissions);
  let documents: StandaloneDocumentOption[] = [];
  let documentsUnavailable = false;
  let initialContentBankSource: StandaloneContentBankOption | null = null;
  let initialSourceError: string | null = null;
  if (canCreate) {
    const [documentResult, selectedSource] = await Promise.all([
      (await createClient()).from("client_documents").select("id,filename,version")
        .eq("client_id", clientId).eq("purpose", "source_material")
        .eq("status", "ready").is("deleted_at", null)
        .order("created_at", { ascending: false }).returns<StandaloneDocumentOption[]>(),
      (async (): Promise<{ option: StandaloneContentBankOption } | { error: string } | null> => {
        const hasSelection = query.sourceId !== undefined || query.sourceType !== undefined;
        if (!hasSelection) return null;
        const parsed = standaloneContentBankSourceSchema.safeParse({
          mode: "content_bank",
          sourceId: typeof query.sourceId === "string" ? query.sourceId : "",
          sourceType: typeof query.sourceType === "string" ? query.sourceType : "",
        });
        if (!parsed.success) return { error: "This Content Bank selection is invalid. Return to Content Bank and choose the entry again." };
        const loaded = await getContentBankEntry(clientId, parsed.data.sourceId, parsed.data.sourceType);
        return loaded ? { option: contentBankOption(loaded.entry) }
          : { error: "This Content Bank entry is no longer available in this workspace." };
      })(),
    ]);
    documents = documentResult.data ?? [];
    documentsUnavailable = !!documentResult.error;
    initialContentBankSource = selectedSource && "option" in selectedSource ? selectedSource.option : null;
    initialSourceError = selectedSource && "error" in selectedSource ? selectedSource.error : null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        description="What needs you first: posts to review, posts ready to publish by hand, and drafts in progress."
      />

      {canCreate ? <StandalonePostForm
        key={initialContentBankSource ? `${initialContentBankSource.sourceType}:${initialContentBankSource.id}` : initialSourceError ? "invalid-content-bank-source" : "standalone"}
        clientId={clientId}
        documents={documents}
        documentsUnavailable={documentsUnavailable}
        canUpload={canRoleManageFounderExperiences(access.role, access.permissions)}
        initialContentBankSource={initialContentBankSource}
        initialSourceError={initialSourceError}
      /> : null}

      {postsResult.ok ? (
        <PostsLanding
          clientId={clientId}
          posts={postsResult.posts}
          drafting={drafting}
          role={access.role}
          canReview={canRoleReviewPosts(access.role, access.permissions)}
        />
      ) : (
        <div className="rounded-card border border-border-grey bg-white p-6 text-small text-danger-strong">
          We could not load post drafts. Please try again.
        </div>
      )}
    </div>
  );
}

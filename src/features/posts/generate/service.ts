import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canMutateClientWorkflow, canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import {
  runContentAgent,
  type ContentAgentBusinessContext,
  type ContentAgentIdeaContext,
  type ContentAgentSourceContext,
} from "@/features/posts/agents/content-agent";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { generatePostRequestSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type GeneratePostData = {
  postId: string;
  alreadyGenerated?: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

type ContentIdeaSourceType =
  | "founder_experience"
  | "trend_card"
  | "trend_reaction";

type ContentIdeaStatus = "draft" | "ready" | "used" | "archived";

type ClientContextRow = {
  industry: string | null;
  business_description: string | null;
  primary_icp: string | null;
  main_offer: string | null;
  core_pov: string | null;
  content_pillars: unknown;
  approved_proof: unknown;
  banned_topics: unknown;
  founder_voice_sample: string | null;
  phrases_to_use: unknown;
  phrases_to_avoid: unknown;
  reference_material: unknown;
  publishing_preferences: unknown;
};

type ContentIdeaRow = {
  id: string;
  source_type: ContentIdeaSourceType;
  source_ids_json: unknown;
  angle: string;
  buyer_pain: string | null;
  commercial_relevance: string | null;
  content_pillar: string | null;
  belief_shift: string | null;
  angle_boundary: string | null;
  source_context: unknown;
  proof_notes: string | null;
  founder_direction: string | null;
  status: ContentIdeaStatus;
};

type FounderExperienceRow = {
  id: string;
  title: string;
  what_happened: string | null;
  what_was_learned: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  entry_type: "work_log" | "trend_reaction";
  reaction_type: string | null;
  source_trend_card_id: string | null;
};

type TrendCardRow = {
  id: string;
  title: string;
  shift: string | null;
  why_it_matters: string | null;
  relevance_to_icp: string | null;
  content_angle: string | null;
  source_item_ids_json: unknown;
  confidence_score: number | null;
  founder_take: string | null;
  approved_for_ideas: boolean;
  week_of: string | null;
};

type SourceArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source_name: string | null;
  published_at: string | null;
};

type SourceLoadResult =
  | { ok: true; sourceContext: ContentAgentSourceContext }
  | { ok: false; failure: ServiceResult<never> };

const uuidSchema = z.string().uuid();

const AUTH_REQUIRED = {
  ok: false as const,
  code: "AUTH_REQUIRED",
  message: "You must be signed in to continue.",
};

const INVALID_INPUT = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "This idea is not available.",
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const WORKFLOW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to generate posts for this Client Workspace.",
};

const IDEA_NOT_AVAILABLE = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This idea is not available.",
};

const CONTENT_AGENT_NOT_CONFIGURED = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "AI post generation is not configured.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not generate this post. Please try again.",
};

function idsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => uuidSchema.safeParse(entry).success,
  );
}

function trimLongText(value: string | null, maxLength = 900): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function toBusinessContext(row: ClientContextRow): ContentAgentBusinessContext {
  return {
    industry: row.industry,
    businessDescription: row.business_description,
    primaryIcp: row.primary_icp,
    mainOffer: row.main_offer,
    corePov: row.core_pov,
    contentPillars: row.content_pillars,
    approvedProof: row.approved_proof,
    bannedTopics: row.banned_topics,
    founderVoiceSample: row.founder_voice_sample,
    phrasesToUse: row.phrases_to_use,
    phrasesToAvoid: row.phrases_to_avoid,
    referenceMaterial: row.reference_material,
    publishingPreferences: row.publishing_preferences,
  };
}

function toIdeaContext(row: ContentIdeaRow): ContentAgentIdeaContext {
  return {
    id: row.id,
    sourceType: row.source_type,
    angle: row.angle,
    buyerPain: row.buyer_pain,
    commercialRelevance: row.commercial_relevance,
    beliefShift: row.belief_shift,
    contentPillar: row.content_pillar,
    angleBoundary: row.angle_boundary,
    sourceContext: row.source_context,
    proofNotes: row.proof_notes,
    founderDirection: row.founder_direction,
  };
}

function trendCardRecord(card: TrendCardRow): Record<string, unknown> {
  return {
    id: card.id,
    title: card.title,
    shift: card.shift,
    why_it_matters: card.why_it_matters,
    relevance_to_icp: card.relevance_to_icp,
    content_angle: card.content_angle,
    confidence_score: card.confidence_score,
    founder_take: card.founder_take,
    approved_for_ideas: card.approved_for_ideas,
    week_of: card.week_of,
  };
}

async function getBusinessContext(
  admin: AdminClient,
  clientId: string,
): Promise<ContentAgentBusinessContext | null> {
  const { data, error } = await admin
    .from("clients")
    .select(
      "industry, business_description, primary_icp, main_offer, core_pov, content_pillars, approved_proof, banned_topics, founder_voice_sample, phrases_to_use, phrases_to_avoid, reference_material, publishing_preferences",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return null;
  return toBusinessContext(data);
}

async function getContentIdea(
  admin: AdminClient,
  clientId: string,
  ideaId: string,
): Promise<ContentIdeaRow | null> {
  const { data, error } = await admin
    .from("content_ideas")
    .select(
      "id, source_type, source_ids_json, angle, buyer_pain, commercial_relevance, content_pillar, belief_shift, angle_boundary, source_context, proof_notes, founder_direction, status",
    )
    .eq("id", ideaId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ContentIdeaRow>();

  if (error || !data) return null;
  return data;
}

async function getExistingPostId(
  admin: AdminClient,
  clientId: string,
  ideaId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("posts")
    .select("id")
    .eq("client_id", clientId)
    .eq("content_idea_id", ideaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error || !data) return null;
  return data.id;
}

async function markContentIdeaUsed(input: {
  clientId: string;
  ideaId: string;
}): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_ideas")
    .update({ status: "used" })
    .eq("id", input.ideaId)
    .eq("client_id", input.clientId)
    .is("deleted_at", null)
    .neq("status", "archived")
    .select("id")
    .maybeSingle<{ id: string }>();

  return !error && Boolean(data);
}

async function auditIdeaMarkedUsed(input: {
  clientId: string;
  userId: string;
  ideaId: string;
  postId: string;
}) {
  await writeAuditLog({
    clientId: input.clientId,
    userId: input.userId,
    action: "content_idea_marked_used",
    entityType: "content_idea",
    entityId: input.ideaId,
    metadata: {
      idea_id: input.ideaId,
      post_id: input.postId,
    },
  });
}

async function getTrendCard(
  admin: AdminClient,
  clientId: string,
  trendCardId: string,
): Promise<TrendCardRow | null> {
  const { data, error } = await admin
    .from("trend_cards")
    .select(
      "id, title, shift, why_it_matters, relevance_to_icp, content_angle, source_item_ids_json, confidence_score, founder_take, approved_for_ideas, week_of",
    )
    .eq("id", trendCardId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle<TrendCardRow>();

  if (error || !data) return null;
  return data;
}

async function getSourceArticles(
  admin: AdminClient,
  clientId: string,
  sourceItemIds: string[],
): Promise<Array<Record<string, unknown>>> {
  if (sourceItemIds.length === 0) return [];

  const { data, error } = await admin
    .from("market_signal_items")
    .select("id, title, summary, url, source_name, published_at")
    .eq("client_id", clientId)
    .in("id", sourceItemIds)
    .is("deleted_at", null)
    .returns<SourceArticleRow[]>();

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    summary: trimLongText(row.summary, 700),
    url: row.url,
    source_name: row.source_name,
    published_at: row.published_at,
  }));
}

async function loadFounderExperienceSource(
  admin: AdminClient,
  clientId: string,
  sourceIds: string[],
): Promise<SourceLoadResult> {
  const sourceId = sourceIds[0];
  if (!sourceId) return { ok: false, failure: IDEA_NOT_AVAILABLE };

  const { data, error } = await admin
    .from("founder_experiences")
    .select(
      "id, title, what_happened, what_was_learned, what_changed, why_it_matters, entry_type, reaction_type, source_trend_card_id",
    )
    .eq("id", sourceId)
    .eq("client_id", clientId)
    .eq("entry_type", "work_log")
    .is("source_trend_card_id", null)
    .is("deleted_at", null)
    .maybeSingle<FounderExperienceRow>();

  if (error || !data) return { ok: false, failure: IDEA_NOT_AVAILABLE };

  return {
    ok: true,
    sourceContext: {
      sourceType: "founder_experience",
      sourceIds: [data.id],
      sourceTitle: data.title,
      source: {
        id: data.id,
        title: data.title,
        what_happened: data.what_happened,
        what_was_learned: data.what_was_learned,
        what_changed: data.what_changed,
        why_it_matters: data.why_it_matters,
      },
      sourceArticles: [],
    },
  };
}

async function loadTrendCardSource(
  admin: AdminClient,
  clientId: string,
  sourceIds: string[],
): Promise<SourceLoadResult> {
  const sourceId = sourceIds[0];
  if (!sourceId) return { ok: false, failure: IDEA_NOT_AVAILABLE };

  const card = await getTrendCard(admin, clientId, sourceId);
  if (!card || !card.approved_for_ideas) {
    return { ok: false, failure: IDEA_NOT_AVAILABLE };
  }

  const sourceArticles = await getSourceArticles(
    admin,
    clientId,
    idsFromJson(card.source_item_ids_json),
  );

  return {
    ok: true,
    sourceContext: {
      sourceType: "trend_card",
      sourceIds: [card.id],
      sourceTitle: card.title,
      source: trendCardRecord(card),
      sourceArticles,
    },
  };
}

async function loadTrendReactionSource(
  admin: AdminClient,
  clientId: string,
  sourceIds: string[],
): Promise<SourceLoadResult> {
  const sourceId = sourceIds[0];
  if (!sourceId) return { ok: false, failure: IDEA_NOT_AVAILABLE };

  const { data: reaction, error } = await admin
    .from("founder_experiences")
    .select(
      "id, title, what_happened, what_was_learned, what_changed, why_it_matters, entry_type, reaction_type, source_trend_card_id",
    )
    .eq("id", sourceId)
    .eq("client_id", clientId)
    .eq("entry_type", "trend_reaction")
    .is("deleted_at", null)
    .maybeSingle<FounderExperienceRow>();

  if (error || !reaction || !reaction.source_trend_card_id) {
    return { ok: false, failure: IDEA_NOT_AVAILABLE };
  }

  const card = await getTrendCard(admin, clientId, reaction.source_trend_card_id);
  if (!card || !card.approved_for_ideas) {
    return { ok: false, failure: IDEA_NOT_AVAILABLE };
  }

  const sourceArticles = await getSourceArticles(
    admin,
    clientId,
    idsFromJson(card.source_item_ids_json),
  );

  return {
    ok: true,
    sourceContext: {
      sourceType: "trend_reaction",
      sourceIds: [reaction.id, card.id],
      sourceTitle: reaction.title,
      source: {
        id: reaction.id,
        title: reaction.title,
        reaction_type: reaction.reaction_type,
        founder_take: reaction.what_was_learned,
        proof_or_example: reaction.what_happened,
        what_changed: reaction.what_changed,
        why_it_matters: reaction.why_it_matters,
      },
      linkedTrendCard: trendCardRecord(card),
      sourceArticles,
    },
  };
}

async function loadSourceContext(
  admin: AdminClient,
  clientId: string,
  idea: ContentIdeaRow,
): Promise<SourceLoadResult> {
  const sourceIds = idsFromJson(idea.source_ids_json);

  if (idea.source_type === "founder_experience") {
    return loadFounderExperienceSource(admin, clientId, sourceIds);
  }

  if (idea.source_type === "trend_card") {
    return loadTrendCardSource(admin, clientId, sourceIds);
  }

  return loadTrendReactionSource(admin, clientId, sourceIds);
}

function buildFinalPost(draft: {
  hook: string;
  body: string;
  cta: string;
}): string {
  return [draft.hook, draft.body, draft.cta]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function generatePostFromIdea(
  clientId: string,
  ideaId: string,
  input: unknown,
): Promise<ServiceResult<GeneratePostData>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const ideaIdResult = uuidSchema.safeParse(ideaId);
  if (!clientIdResult.success || !ideaIdResult.success) return INVALID_INPUT;

  const parsed = generatePostRequestSchema.safeParse(input ?? {});
  if (!parsed.success) return INVALID_INPUT;

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return NO_ACCESS;

  const canMutate = await canMutateClientWorkflow(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const admin = createAdminClient();
  const [businessContext, idea, existingPostId] = await Promise.all([
    getBusinessContext(admin, clientIdResult.data),
    getContentIdea(admin, clientIdResult.data, ideaIdResult.data),
    getExistingPostId(admin, clientIdResult.data, ideaIdResult.data),
  ]);

  if (!businessContext) return NO_ACCESS;
  if (!idea) return IDEA_NOT_AVAILABLE;
  if (idea.status === "archived") return IDEA_NOT_AVAILABLE;

  if (existingPostId) {
    if (idea.status !== "used") {
      const markedUsed = await markContentIdeaUsed({
        clientId: clientIdResult.data,
        ideaId: idea.id,
      });

      if (!markedUsed) return GENERIC_FAILURE;

      await auditIdeaMarkedUsed({
        clientId: clientIdResult.data,
        userId: user.id,
        ideaId: idea.id,
        postId: existingPostId,
      });
    }

    revalidatePath(`/client/${clientIdResult.data}/ideas`);
    return {
      ok: true,
      data: { postId: existingPostId, alreadyGenerated: true },
    };
  }

  if (idea.status !== "ready") return IDEA_NOT_AVAILABLE;

  const source = await loadSourceContext(admin, clientIdResult.data, idea);
  if (!source.ok) return source.failure;

  const agentResult = await runContentAgent({
    clientId: clientIdResult.data,
    userId: user.id,
    businessContext,
    idea: toIdeaContext(idea),
    sourceContext: source.sourceContext,
  });

  if (!agentResult.ok) {
    return agentResult.reason === "not_configured"
      ? CONTENT_AGENT_NOT_CONFIGURED
      : GENERIC_FAILURE;
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("posts")
    .insert({
      client_id: clientIdResult.data,
      content_idea_id: idea.id,
      final_post: buildFinalPost(agentResult.draft),
      buyer_belief_shift: idea.belief_shift,
      proof_notes: agentResult.draft.proofUsed,
      risk_notes: agentResult.draft.riskNotes,
      cta_intent: agentResult.draft.cta,
      source_context_used: {
        idea_id: idea.id,
        source_type: idea.source_type,
        source_ids: source.sourceContext.sourceIds,
        source_title: source.sourceContext.sourceTitle,
        format: agentResult.draft.format,
        content_type: agentResult.draft.contentType,
        target_icp: agentResult.draft.targetIcp,
        design_brief: agentResult.draft.designBrief,
      },
      status: "review",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      const existingId = await getExistingPostId(admin, clientIdResult.data, idea.id);
      if (existingId) {
        await markContentIdeaUsed({
          clientId: clientIdResult.data,
          ideaId: idea.id,
        });
        revalidatePath(`/client/${clientIdResult.data}/ideas`);
        revalidatePath(`/client/${clientIdResult.data}/posts`);
        revalidatePath(`/client/${clientIdResult.data}/dashboard`);
        revalidatePath(`/client/${clientIdResult.data}/posts/${existingId}/review`);
        return {
          ok: true,
          data: { postId: existingId, alreadyGenerated: true },
        };
      }
    }
    return GENERIC_FAILURE;
  }

  const markedUsed = await markContentIdeaUsed({
    clientId: clientIdResult.data,
    ideaId: idea.id,
  });

  if (!markedUsed) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "post_generated",
    entityType: "post",
    entityId: inserted.id,
    metadata: {
      idea_id: idea.id,
      post_id: inserted.id,
      source_type: idea.source_type,
    },
  });

  await auditIdeaMarkedUsed({
    clientId: clientIdResult.data,
    userId: user.id,
    ideaId: idea.id,
    postId: inserted.id,
  });

  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/posts`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);
  revalidatePath(`/client/${clientIdResult.data}/posts/${inserted.id}/review`);

  return { ok: true, data: { postId: inserted.id, alreadyGenerated: false } };
}

export async function deletePost(
  clientId: string,
  postId: string,
  confirmDelete?: string,
): Promise<ServiceResult<void>> {
  const { user } = await getServerUser();
  if (!user) return { ok: false, code: "AUTH_REQUIRED", message: "You must be signed in to continue." };

  const clientIdResult = uuidSchema.safeParse(clientId);
  const postIdResult = uuidSchema.safeParse(postId);
  if (!clientIdResult.success || !postIdResult.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Invalid parameters." };
  }

  const isAuthorized = await canUserDeleteBusinessRecords(user.id, clientIdResult.data);
  if (!isAuthorized) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to delete posts for this Client Workspace." };

  const supabase = await createClient();

  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("id, status, content_idea_id")
    .eq("id", postIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !post) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found." };
  }

  if (post.status === "approved" || post.status === "published") {
    if (confirmDelete !== "DELETE") {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "To delete an approved or published post, you must type 'DELETE' to confirm.",
      };
    }
  }

  const { error: rpcError } = await supabase.rpc(
    "delete_post_and_restore_idea",
    {
      p_client_id: clientIdResult.data,
      p_post_id: postIdResult.data,
    }
  );

  if (rpcError) {
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message: rpcError.message || "Could not delete this post. Please try again.",
    };
  }

  let ideaRestored = false;
  if (post.content_idea_id) {
    const { data: idea } = await supabase
      .from("content_ideas")
      .select("status")
      .eq("id", post.content_idea_id)
      .eq("client_id", clientIdResult.data)

    if (idea && idea.status === "ready") {
      ideaRestored = true;
    }
  }

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "post_hard_deleted",
    entityType: "post",
    entityId: postIdResult.data,
    metadata: {
      post_id: postIdResult.data,
      previous_status: post.status,
      linked_idea_id: post.content_idea_id,
      linked_idea_restored_to_ready: ideaRestored,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/posts`);
  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/publish`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);

  return { ok: true, data: undefined };
}

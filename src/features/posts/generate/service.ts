import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canDraftPosts, canUserDeleteBusinessRecords } from "@/lib/access/client-access";
import {
  runContentAgent,
  buildFinalPost,
  type ContentAgentBusinessContext,
  type ContentAgentIdeaContext,
  type ContentAgentSourceContext,
  type GeneratedPostDraft,
} from "@/features/posts/agents/content-agent";
import { runReviewAgent } from "@/features/posts/agents/review-agent";
import {
  replanContentIdea,
  type PlanningBusinessContext,
  type PlanningSourceContext,
} from "@/features/ideas/agents/planning-agent";
import { decideGenerationPlan } from "@/features/ideas/agents/plan-lifecycle";
import {
  applyStrategyOverrides,
  GENERATION_PLAN_VERSION,
  strategyOverridesSchema,
  type GenerationPlanV2,
  type StrategyOverrides,
} from "@/lib/ai/playbooks/contracts";
import { runDeterministicPostChecks } from "@/lib/ai/playbooks/deterministic-checks";
import {
  buildSelectedSourceHashValue,
  computeGenerationPlanInputHash,
} from "@/lib/ai/playbooks/plan-hash";
import { writeAuditLog } from "@/lib/audit/log";
import {
  buildQaBlockDetails,
  type QaBlockDetails,
} from "@/lib/ai/playbooks/qa-block-reasons";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { generatePostRequestSchema } from "./schemas";
import {
  buildStrategyCompatibility,
  validatePlanAgainstCompatibility,
  type StrategyCompatibility,
} from "@/lib/ai/playbooks/strategy-compatibility";
import type { PlanningResource } from "@/features/ideas/agents/planning-agent";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: QaBlockDetails };

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
  approved_proof: unknown;
  banned_topics: unknown;
  founder_voice_sample: string | null;
  founder_voice_examples: unknown;
  phrases_to_use: unknown;
  phrases_to_avoid: unknown;
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
  generation_plan: unknown;
  generation_plan_version: number | null;
  generation_plan_input_hash: string | null;
  strategy_overrides: unknown;
  selected_resource_id: string | null;
  status: ContentIdeaStatus;
};

type PlanningResourceRow = {
  id: string;
  title: string;
  resource_type: string;
  description: string | null;
  problem_solved: string | null;
  target_use_case: string | null;
  keyword: string;
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

const REVIEW_AGENT_NOT_CONFIGURED = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "AI post review is not configured.",
};

const QA_BLOCKED_MESSAGE =
  "AI review blocked this draft because it needs stronger proof or a strategy change. The idea remains ready for editing.";

function qaBlockedFailure(details: QaBlockDetails): {
  ok: false;
  code: string;
  message: string;
  details: QaBlockDetails;
} {
  return {
    ok: false,
    code: "QA_BLOCKED",
    message: QA_BLOCKED_MESSAGE,
    details,
  };
}

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
    approvedProof: row.approved_proof,
    bannedTopics: row.banned_topics,
    founderVoiceSample: row.founder_voice_sample,
    founderVoiceExamples: row.founder_voice_examples,
    phrasesToUse: row.phrases_to_use,
    phrasesToAvoid: row.phrases_to_avoid,
  };
}

function toIdeaContext(
  row: ContentIdeaRow,
  generationPlan: GenerationPlanV2,
  editNote: string | null = null,
): ContentAgentIdeaContext {
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
    editNote,
    generationPlan,
  };
}

function toPlanningBusinessContext(
  context: ContentAgentBusinessContext,
): PlanningBusinessContext {
  return {
    industry: context.industry,
    businessDescription: context.businessDescription,
    primaryIcp: context.primaryIcp,
    mainOffer: context.mainOffer,
    approvedProof: context.approvedProof,
    bannedTopics: context.bannedTopics,
  };
}

function toPlanningSourceContext(
  source: ContentAgentSourceContext,
): PlanningSourceContext {
  return {
    mode: source.sourceType,
    sourceId: source.sourceIds[0] ?? "",
    sourceTitle: source.sourceTitle ?? "Untitled source",
    linkedTrendCardId:
      typeof source.linkedTrendCard?.id === "string"
        ? source.linkedTrendCard.id
        : undefined,
    linkedTrendCardTitle:
      typeof source.linkedTrendCard?.title === "string"
        ? source.linkedTrendCard.title
        : undefined,
    linkedTrendCard: source.linkedTrendCard,
    source: source.source,
    sourceArticles: source.sourceArticles,
  };
}

function ideaHashMetadata(idea: ContentIdeaRow) {
  return {
    angle: idea.angle,
    buyerPain: idea.buyer_pain,
    commercialRelevance: idea.commercial_relevance,
    beliefShift: idea.belief_shift,
    contentPillar: idea.content_pillar,
    angleBoundary: idea.angle_boundary,
    sourceContext: idea.source_context,
    proofNotes: idea.proof_notes,
  };
}

function parseStrategyOverrides(value: unknown): StrategyOverrides {
  const parsed = strategyOverridesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeStrategyOverrides(input: {
  overrides: StrategyOverrides;
  resources: PlanningResource[];
  commentGateEligible: boolean;
}): StrategyOverrides {
  const next = { ...input.overrides };
  const selectedResourceIsAvailable =
    typeof next.resourceId === "string" &&
    input.resources.some((resource) => resource.id === next.resourceId);

  if (!input.commentGateEligible || !selectedResourceIsAvailable) {
    delete next.resourceId;
    if (next.ctaType === "comment_gate") delete next.ctaType;
  }

  return next;
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
      "industry, business_description, primary_icp, main_offer, approved_proof, banned_topics, founder_voice_sample, founder_voice_examples, phrases_to_use, phrases_to_avoid",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return null;
  return toBusinessContext(data);
}

async function getApprovedPlanningResources(
  admin: AdminClient,
  clientId: string,
): Promise<PlanningResource[]> {
  const { data, error } = await admin
    .from("content_resources")
    .select(
      "id, title, resource_type, description, problem_solved, target_use_case, keyword",
    )
    .eq("client_id", clientId)
    .eq("active", true)
    .eq("comment_gate_approved", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<PlanningResourceRow[]>();

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.resource_type,
    description: row.description,
    problemSolved: row.problem_solved,
    targetUseCase: row.target_use_case,
    keyword: row.keyword,
  }));
}

async function isCommentGateEligible(
  admin: AdminClient,
  clientId: string,
  ignorePostId?: string,
): Promise<boolean> {
  const baseQuery = admin
    .from("posts")
    .select("id, source_context_used")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  const query = ignorePostId
    ? baseQuery.neq("id", ignorePostId).limit(5)
    : baseQuery.limit(5);

  const { data, error } = await query.returns<
    Array<{ id: string; source_context_used: unknown }>
  >();
  if (error || !data) return false;

  return !data.some((row) => {
    const value = row.source_context_used;
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).cta_type === "comment_gate"
    );
  });
}

function containsMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(containsMeaningfulValue);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      containsMeaningfulValue,
    );
  }
  return false;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(textFromUnknown)
      .join(" ");
  }
  return "";
}

function buildCompatibilityForSource(input: {
  businessContext: ContentAgentBusinessContext;
  sourceContext: ContentAgentSourceContext;
  resources: PlanningResource[];
  commentGateEligible: boolean;
}): StrategyCompatibility {
  const sourceText = textFromUnknown(input.sourceContext.source).toLowerCase();
  const approvedEvidenceText = textFromUnknown(
    input.businessContext.approvedProof,
  ).toLowerCase();
  const hasStartingState = containsMeaningfulValue(
    input.sourceContext.source.what_happened,
  );
  const hasChangedState = containsMeaningfulValue(
    input.sourceContext.source.what_changed,
  );
  const evidenceHasBeforeAfter =
    /\bbefore\b/.test(approvedEvidenceText) &&
    /\bafter\b/.test(approvedEvidenceText);

  return buildStrategyCompatibility({
    sourceMode: input.sourceContext.sourceType,
    hasDocumentedBeforeAfter:
      (hasStartingState && hasChangedState) || evidenceHasBeforeAfter,
    hasDocumentedResult:
      hasChangedState ||
      /(?:\d|%|\b(?:result|reduced|increased|improved|grew|saved|won|generated|cut|doubled)\b)/.test(
        approvedEvidenceText,
      ),
    hasDocumentedMistake:
      input.sourceContext.sourceType !== "trend_card" &&
      /\b(mistake|failed|failure|wrong|learned|lesson|broke|broken)\b/.test(
        sourceText,
      ),
    approvedResourceIds: input.resources.map((resource) => resource.id),
    commentGateEligible: input.commentGateEligible,
  });
}

function selectedResourceForPlan(
  resources: PlanningResource[],
  plan: GenerationPlanV2,
): Record<string, unknown> | null {
  const resource = resources.find(
    (candidate) => candidate.id === plan.execution.resourceId,
  );
  return resource
    ? {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        description: resource.description,
        problem_solved: resource.problemSolved,
        target_use_case: resource.targetUseCase,
        keyword: resource.keyword,
        delivery_is_manual: true,
      }
    : null;
}

async function getContentIdea(
  admin: AdminClient,
  clientId: string,
  ideaId: string,
): Promise<ContentIdeaRow | null> {
  const { data, error } = await admin
    .from("content_ideas")
    .select(
      "id, source_type, source_ids_json, angle, buyer_pain, commercial_relevance, content_pillar, belief_shift, angle_boundary, source_context, proof_notes, founder_direction, generation_plan, generation_plan_version, generation_plan_input_hash, strategy_overrides, selected_resource_id, status",
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

type ReviewedPostValues = {
  finalPost: string;
  buyerBeliefShift: string;
  proofNotes: string;
  riskNotes: string;
  ctaIntent: string;
  qaResult: Record<string, unknown>;
  formatRecommendation: Record<string, unknown>;
  sourceContextUsed: Record<string, unknown>;
};

async function produceReviewedPost(input: {
  clientId: string;
  userId: string;
  businessContext: ContentAgentBusinessContext;
  idea: ContentIdeaRow;
  sourceContext: ContentAgentSourceContext;
  resources: PlanningResource[];
  commentGateEligible: boolean;
  editNote?: string | null;
}): Promise<
  | { ok: true; values: ReviewedPostValues }
  | { ok: false; failure: ServiceResult<never> }
> {
  const strategyOverrides = normalizeStrategyOverrides({
    overrides: parseStrategyOverrides(input.idea.strategy_overrides),
    resources: input.resources,
    commentGateEligible: input.commentGateEligible,
  });
  const compatibility = buildCompatibilityForSource({
    businessContext: input.businessContext,
    sourceContext: input.sourceContext,
    resources: input.resources,
    commentGateEligible: input.commentGateEligible,
  });
  const selectedSourceForHash = buildSelectedSourceHashValue({
    sourceMode: input.sourceContext.sourceType,
    sourceIds: input.sourceContext.sourceIds,
    sourceTitle: input.sourceContext.sourceTitle,
    source: input.sourceContext.source,
    linkedTrendCard: input.sourceContext.linkedTrendCard ?? null,
    sourceArticles: input.sourceContext.sourceArticles,
  });
  const currentPlanInputHash = computeGenerationPlanInputHash({
    businessContext: toPlanningBusinessContext(input.businessContext),
    selectedSource: selectedSourceForHash,
    idea: ideaHashMetadata(input.idea),
    founderDirection: input.idea.founder_direction,
    strategyOverrides,
    resourceState: input.resources,
    commentGateEligible: input.commentGateEligible,
  });
  const planDecision = decideGenerationPlan({
    plan: input.idea.generation_plan,
    version: input.idea.generation_plan_version,
    storedInputHash: input.idea.generation_plan_input_hash,
    currentInputHash: currentPlanInputHash,
    sourceMode: input.idea.source_type,
  });

  const supabase = await createClient();
  let generationPlan: GenerationPlanV2;

  if (
    planDecision.action === "reuse" &&
    validatePlanAgainstCompatibility(planDecision.plan, compatibility).length === 0
  ) {
    generationPlan = planDecision.plan;
  } else {
    const replanResult = await replanContentIdea({
      clientId: input.clientId,
      userId: input.userId,
      businessContext: toPlanningBusinessContext(input.businessContext),
      sourceContext: toPlanningSourceContext(input.sourceContext),
      idea: {
        angle: input.idea.angle,
        buyerPain: input.idea.buyer_pain,
        commercialRelevance: input.idea.commercial_relevance,
        beliefShift: input.idea.belief_shift,
        contentPillar: input.idea.content_pillar,
        angleBoundary: input.idea.angle_boundary,
        sourceContext: input.idea.source_context,
        proofNotes: input.idea.proof_notes,
        founderDirection: input.idea.founder_direction,
      },
      strategyOverrides,
      compatibility,
      resources: input.resources,
    });

    if (!replanResult.ok) {
      if (replanResult.reason === "blocked") {
        const details = buildQaBlockDetails({ stage: "initial_review" });
        await writeAuditLog({
          clientId: input.clientId,
          userId: input.userId,
          action: "post_generation_blocked_by_qa",
          entityType: "content_idea",
          entityId: input.idea.id,
          metadata: {
            idea_id: input.idea.id,
            source_type: input.idea.source_type,
            blocked_stage: details.blockedStage,
            reason_codes: details.reasonCodes,
          },
        });
        return { ok: false, failure: qaBlockedFailure(details) };
      }
      return {
        ok: false,
        failure:
          replanResult.reason === "not_configured"
            ? CONTENT_AGENT_NOT_CONFIGURED
            : GENERIC_FAILURE,
      };
    }

    try {
      generationPlan = applyStrategyOverrides(
        replanResult.generationPlan,
        strategyOverrides,
      );
    } catch {
      return { ok: false, failure: GENERIC_FAILURE };
    }
    if (
      validatePlanAgainstCompatibility(generationPlan, compatibility).length > 0
    ) {
      return { ok: false, failure: GENERIC_FAILURE };
    }

    const { data: updatedIdea, error: planUpdateError } = await supabase
      .from("content_ideas")
      .update({
        generation_plan: generationPlan,
        generation_plan_version: GENERATION_PLAN_VERSION,
        generation_plan_input_hash: currentPlanInputHash,
        strategy_overrides: strategyOverrides,
        selected_resource_id: generationPlan.execution.resourceId,
      })
      .eq("id", input.idea.id)
      .eq("client_id", input.clientId)
      .is("deleted_at", null)
      .in("status", ["ready", "used"])
      .select("id")
      .maybeSingle<{ id: string }>();

    if (planUpdateError || !updatedIdea) {
      return { ok: false, failure: GENERIC_FAILURE };
    }
  }

  const contentIdeaContext = toIdeaContext(
    input.idea,
    generationPlan,
    input.editNote ?? null,
  );
  const selectedResource = selectedResourceForPlan(
    input.resources,
    generationPlan,
  );
  const sourceContext: ContentAgentSourceContext = {
    ...input.sourceContext,
    selectedResource,
  };
  const agentResult = await runContentAgent({
    clientId: input.clientId,
    userId: input.userId,
    businessContext: input.businessContext,
    idea: contentIdeaContext,
    sourceContext,
  });

  if (!agentResult.ok) {
    return {
      ok: false,
      failure:
        agentResult.reason === "not_configured"
          ? CONTENT_AGENT_NOT_CONFIGURED
          : GENERIC_FAILURE,
    };
  }

  const initialDeterministicIssues = runDeterministicPostChecks({
    finalPost: buildFinalPost(agentResult.draft),
    cta: agentResult.draft.cta,
    plan: generationPlan,
    approvedProof: input.businessContext.approvedProof,
    selectedSource: sourceContext,
    phrasesToAvoid: input.businessContext.phrasesToAvoid,
    bannedTopics: input.businessContext.bannedTopics,
    selectedResource,
    primaryIcp: input.businessContext.primaryIcp,
  });

  let reviewResult = await runReviewAgent({
    clientId: input.clientId,
    userId: input.userId,
    businessContext: input.businessContext,
    idea: contentIdeaContext,
    sourceContext,
    plan: generationPlan,
    draft: agentResult.draft,
    deterministicIssues: initialDeterministicIssues,
  });

  if (!reviewResult.ok) {
    return {
      ok: false,
      failure:
        reviewResult.reason === "not_configured"
          ? REVIEW_AGENT_NOT_CONFIGURED
          : GENERIC_FAILURE,
    };
  }

  if (reviewResult.qa.verdict === "blocked" || !reviewResult.qa.finalPost) {
    const details = buildQaBlockDetails({
      stage: "initial_review",
      deterministicIssues: initialDeterministicIssues,
      qaChecks: reviewResult.qa.checks,
    });
    await writeAuditLog({
      clientId: input.clientId,
      userId: input.userId,
      action: "post_generation_blocked_by_qa",
      entityType: "content_idea",
      entityId: input.idea.id,
      metadata: {
        idea_id: input.idea.id,
        source_type: input.idea.source_type,
        blocked_stage: details.blockedStage,
        reason_codes: details.reasonCodes,
        issue_count: reviewResult.qa.issues.length,
      },
    });
    return { ok: false, failure: qaBlockedFailure(details) };
  }

  let finalDeterministicIssues = runDeterministicPostChecks({
    finalPost: reviewResult.qa.finalPost,
    cta: reviewResult.qa.finalCta,
    plan: generationPlan,
    approvedProof: input.businessContext.approvedProof,
    selectedSource: sourceContext,
    phrasesToAvoid: input.businessContext.phrasesToAvoid,
    bannedTopics: input.businessContext.bannedTopics,
    selectedResource,
    primaryIcp: input.businessContext.primaryIcp,
  });

  if (finalDeterministicIssues.length > 0) {
    const priorQa = reviewResult.qa;
    const reviewedDraft: GeneratedPostDraft = {
      hook: "",
      body: priorQa.finalPost!,
      cta: priorQa.finalCta,
      format: "text",
      proofUsed: priorQa.proofNotes,
      riskNotes: priorQa.riskNotes,
    };
    reviewResult = await runReviewAgent({
      clientId: input.clientId,
      userId: input.userId,
      businessContext: input.businessContext,
      idea: contentIdeaContext,
      sourceContext,
      plan: generationPlan,
      draft: reviewedDraft,
      deterministicIssues: finalDeterministicIssues,
      priorQa,
    });

    if (
      !reviewResult.ok ||
      reviewResult.qa.verdict === "blocked" ||
      !reviewResult.qa.finalPost
    ) {
      if (!reviewResult.ok) {
        return { ok: false, failure: GENERIC_FAILURE };
      }
      const details = buildQaBlockDetails({
        stage: "corrective_review",
        deterministicIssues: finalDeterministicIssues,
        qaChecks: reviewResult.qa.checks,
      });
      await writeAuditLog({
        clientId: input.clientId,
        userId: input.userId,
        action: "post_generation_blocked_by_qa",
        entityType: "content_idea",
        entityId: input.idea.id,
        metadata: {
          idea_id: input.idea.id,
          source_type: input.idea.source_type,
          blocked_stage: details.blockedStage,
          reason_codes: details.reasonCodes,
          issue_count: reviewResult.qa.issues.length,
        },
      });
      return { ok: false, failure: qaBlockedFailure(details) };
    }

    finalDeterministicIssues = runDeterministicPostChecks({
      finalPost: reviewResult.qa.finalPost,
      cta: reviewResult.qa.finalCta,
      plan: generationPlan,
      approvedProof: input.businessContext.approvedProof,
      selectedSource: sourceContext,
      phrasesToAvoid: input.businessContext.phrasesToAvoid,
      bannedTopics: input.businessContext.bannedTopics,
      selectedResource,
      primaryIcp: input.businessContext.primaryIcp,
    });

    if (finalDeterministicIssues.length > 0) {
      const details = buildQaBlockDetails({
        stage: "final_validation",
        deterministicIssues: finalDeterministicIssues,
      });
      await writeAuditLog({
        clientId: input.clientId,
        userId: input.userId,
        action: "post_generation_blocked_by_qa",
        entityType: "content_idea",
        entityId: input.idea.id,
        metadata: {
          idea_id: input.idea.id,
          source_type: input.idea.source_type,
          blocked_stage: details.blockedStage,
          reason_codes: details.reasonCodes,
          issue_count: finalDeterministicIssues.length,
        },
      });
      return { ok: false, failure: qaBlockedFailure(details) };
    }
  }

  return {
    ok: true,
    values: {
      finalPost: reviewResult.qa.finalPost,
      buyerBeliefShift: `${generationPlan.strategy.currentBelief} -> ${generationPlan.strategy.desiredBelief}`,
      proofNotes: reviewResult.qa.proofNotes,
      riskNotes: reviewResult.qa.riskNotes,
      ctaIntent: reviewResult.qa.finalCta,
      qaResult: {
        ...reviewResult.qa,
        deterministicChecks: {
          initialIssues: initialDeterministicIssues,
          finalIssues: finalDeterministicIssues,
        },
      },
      formatRecommendation: reviewResult.qa.formatRecommendation!,
      sourceContextUsed: {
        idea_id: input.idea.id,
        source_type: input.idea.source_type,
        source_ids: sourceContext.sourceIds,
        source_title: sourceContext.sourceTitle,
        format: agentResult.draft.format,
        generation_plan_version: GENERATION_PLAN_VERSION,
        generation_plan_input_hash: currentPlanInputHash,
        angle_type: generationPlan.strategy.angleType,
        content_archetype: generationPlan.execution.contentArchetype,
        post_structure: generationPlan.execution.postStructure,
        body_framework: generationPlan.execution.bodyFramework,
        hook_type: generationPlan.execution.hookType,
        cta_type: generationPlan.execution.ctaType,
        target_icp: generationPlan.strategy.targetIcp,
        selected_resource_id: generationPlan.execution.resourceId,
      },
    },
  };
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

  const canMutate = await canDraftPosts(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const admin = createAdminClient();
  const [
    businessContext,
    idea,
    existingPostId,
    resources,
    commentGateEligible,
  ] = await Promise.all([
    getBusinessContext(admin, clientIdResult.data),
    getContentIdea(admin, clientIdResult.data, ideaIdResult.data),
    getExistingPostId(admin, clientIdResult.data, ideaIdResult.data),
    getApprovedPlanningResources(admin, clientIdResult.data),
    isCommentGateEligible(admin, clientIdResult.data),
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

  const generated = await produceReviewedPost({
    clientId: clientIdResult.data,
    userId: user.id,
    businessContext,
    idea,
    sourceContext: source.sourceContext,
    resources,
    commentGateEligible,
  });

  if (!generated.ok) return generated.failure;

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("posts")
    .insert({
      client_id: clientIdResult.data,
      content_idea_id: idea.id,
      final_post: generated.values.finalPost,
      buyer_belief_shift: generated.values.buyerBeliefShift,
      proof_notes: generated.values.proofNotes,
      risk_notes: generated.values.riskNotes,
      cta_intent: generated.values.ctaIntent,
      qa_result: generated.values.qaResult,
      format_recommendation: generated.values.formatRecommendation,
      source_context_used: generated.values.sourceContextUsed,
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

export async function redraftPostFromReview(
  clientId: string,
  postId: string,
): Promise<ServiceResult<GeneratePostData>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  const postIdResult = uuidSchema.safeParse(postId);
  if (!clientIdResult.success || !postIdResult.success) return INVALID_INPUT;

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return NO_ACCESS;

  const canMutate = await canDraftPosts(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const admin = createAdminClient();
  const { data: post, error: postError } = await admin
    .from("posts")
    .select("id, content_idea_id, status, edit_note")
    .eq("id", postIdResult.data)
    .eq("client_id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      content_idea_id: string | null;
      status: string;
      edit_note: string | null;
    }>();

  if (
    postError ||
    !post ||
    post.status !== "needs_edit" ||
    !post.content_idea_id ||
    !post.edit_note
  ) {
    return IDEA_NOT_AVAILABLE;
  }

  const [businessContext, idea, resources, commentGateEligible] =
    await Promise.all([
    getBusinessContext(admin, clientIdResult.data),
    getContentIdea(admin, clientIdResult.data, post.content_idea_id),
    getApprovedPlanningResources(admin, clientIdResult.data),
    isCommentGateEligible(admin, clientIdResult.data, post.id),
  ]);
  if (!businessContext) return NO_ACCESS;
  if (!idea || idea.status !== "used") return IDEA_NOT_AVAILABLE;

  const source = await loadSourceContext(admin, clientIdResult.data, idea);
  if (!source.ok) return source.failure;

  const generated = await produceReviewedPost({
    clientId: clientIdResult.data,
    userId: user.id,
    businessContext,
    idea,
    sourceContext: source.sourceContext,
    resources,
    commentGateEligible,
    editNote: post.edit_note,
  });
  if (!generated.ok) return generated.failure;

  const supabase = await createClient();
  const { data: updated, error: updateError } = await supabase
    .from("posts")
    .update({
      final_post: generated.values.finalPost,
      buyer_belief_shift: generated.values.buyerBeliefShift,
      proof_notes: generated.values.proofNotes,
      risk_notes: generated.values.riskNotes,
      cta_intent: generated.values.ctaIntent,
      qa_result: generated.values.qaResult,
      format_recommendation: generated.values.formatRecommendation,
      source_context_used: generated.values.sourceContextUsed,
      status: "review",
      edit_note: null,
    })
    .eq("id", post.id)
    .eq("client_id", clientIdResult.data)
    .eq("status", "needs_edit")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError || !updated) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "post_redrafted",
    entityType: "post",
    entityId: post.id,
    metadata: {
      post_id: post.id,
      idea_id: idea.id,
      source_type: idea.source_type,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/ideas`);
  revalidatePath(`/client/${clientIdResult.data}/posts`);
  revalidatePath(`/client/${clientIdResult.data}/dashboard`);
  revalidatePath(`/client/${clientIdResult.data}/posts/${post.id}/review`);

  return { ok: true, data: { postId: post.id, alreadyGenerated: false } };
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
    if (rpcError.code === "P0002") {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Post not found.",
      };
    }
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message: "Could not delete this post. Please try again.",
    };
  }

  let ideaRestored = false;
  if (post.content_idea_id) {
    const { data: idea } = await supabase
      .from("content_ideas")
      .select("status")
      .eq("id", post.content_idea_id)
      .eq("client_id", clientIdResult.data)
      .is("deleted_at", null)
      .maybeSingle<{ status: string }>();

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

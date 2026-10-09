import "server-only";

import { computeContentHash } from "@/features/documents/retrieval-service";
import { STANDALONE_SOURCE_MAX_BYTES } from "./standalone-brief-schema";

import { storedFindingSchema } from "@/features/research/web-research/contracts";

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
  composeRiskNotes,
  dedupeWarnings,
  warningsFromDeterministicIssues,
  warningsFromFailedChecks,
  type QaWarningCode,
} from "@/lib/ai/playbooks/qa-warnings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";
import { isMissingTableError } from "@/lib/supabase/schema-errors";

import { generatePostRequestSchema } from "./schemas";
import {
  buildStrategyCompatibility,
  validatePlanAgainstCompatibility,
  type StrategyCompatibility,
} from "@/lib/ai/playbooks/strategy-compatibility";
import type { PlanningResource } from "@/features/ideas/agents/planning-agent";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type GeneratePostData = {
  postId: string;
  alreadyGenerated?: boolean;
};

import type { SourceMode, AllocationBucket } from "@/lib/ai/playbooks/taxonomies";

export type AdminClient = ReturnType<typeof createAdminClient>;

export type ContentIdeaSourceType = SourceMode;

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
  audience_understanding?: string | null;
  pain_points?: string | null;
  commercial_details?: string | null;
  delivery_approach?: string | null;
  business_positioning?: string | null;
  questions_and_doubts?: string | null;
  founder_name?: string | null;
  role_and_work?: string | null;
  personal_positioning?: string | null;
  personal_readers?: string | null;
  content_pillars?: unknown;
  principles?: string | null;
  voice_guide?: string | null;
  boundaries?: string | null;
  business_mentions?: string | null;
  profile_revision?: number | null;
};

export type ContentIdeaRow = {
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
  allocation_bucket?: AllocationBucket;
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

/**
 * Used when QA declines to finalise a draft. The post is still stored, so a
 * recommendation is still required by the posts schema.
 */
const FALLBACK_FORMAT_RECOMMENDATION = {
  primaryFormat: "text" as const,
  alternativeFormats: [] as const,
  rationale:
    "Kept as a text post. The AI reviewer did not return a format recommendation for this draft.",
  adaptationNotes: [] as const,
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
    audienceUnderstanding: row.audience_understanding ?? null,
    painPoints: row.pain_points ?? null,
    mainOffer: row.main_offer,
    commercialDetails: row.commercial_details ?? null,
    deliveryApproach: row.delivery_approach ?? null,
    businessPositioning: row.business_positioning ?? null,
    questionsAndDoubts: row.questions_and_doubts ?? null,
    approvedProof: row.approved_proof,
    bannedTopics: row.banned_topics,
    founderVoiceSample: row.founder_voice_sample,
    founderVoiceExamples: row.founder_voice_examples,
    phrasesToUse: row.phrases_to_use,
    phrasesToAvoid: row.phrases_to_avoid,

    founderName: row.founder_name ?? null,
    roleAndWork: row.role_and_work ?? null,
    personalPositioning: row.personal_positioning ?? null,
    personalReaders: row.personal_readers ?? null,
    contentPillars: row.content_pillars ?? [],
    principles: row.principles ?? null,
    voiceGuide: row.voice_guide ?? null,
    boundaries: row.boundaries ?? null,
    businessMentions: row.business_mentions ?? null,
    profileRevision: typeof row.profile_revision === "number" ? row.profile_revision : 1,
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
    audienceUnderstanding: context.audienceUnderstanding,
    painPoints: context.painPoints,
    mainOffer: context.mainOffer,
    commercialDetails: context.commercialDetails,
    deliveryApproach: context.deliveryApproach,
    businessPositioning: context.businessPositioning,
    questionsAndDoubts: context.questionsAndDoubts,
    approvedProof: context.approvedProof,
    bannedTopics: context.bannedTopics,
    founderName: context.founderName,
    roleAndWork: context.roleAndWork,
    personalPositioning: context.personalPositioning,
    personalReaders: context.personalReaders,
    contentPillars: context.contentPillars,
    principles: context.principles,
    profileRevision: context.profileRevision,
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

export async function getBusinessContext(
  admin: AdminClient,
  clientId: string,
): Promise<ContentAgentBusinessContext | null> {
  const { data, error } = await admin
    .from("clients")
    .select(
      "industry, business_description, primary_icp, main_offer, approved_proof, banned_topics, founder_voice_sample, founder_voice_examples, phrases_to_use, phrases_to_avoid, audience_understanding, pain_points, commercial_details, delivery_approach, business_positioning, questions_and_doubts, founder_name, role_and_work, personal_positioning, personal_readers, content_pillars, principles, voice_guide, boundaries, business_mentions, profile_revision",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return null;
  return toBusinessContext(data);
}

export async function getApprovedPlanningResources(
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

export async function isCommentGateEligible(
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

export async function loadSourceContext(
  admin: AdminClient,
  clientId: string,
  idea: Pick<ContentIdeaRow, "source_type" | "source_ids_json" | "source_context">,
): Promise<SourceLoadResult> {
  const sourceIds = idsFromJson(idea.source_ids_json);

  if (idea.source_type === "founder_experience") {
    return loadFounderExperienceSource(admin, clientId, sourceIds);
  }

  if (idea.source_type === "trend_card") {
    return loadTrendCardSource(admin, clientId, sourceIds);
  }

  if (idea.source_type === "trend_reaction") {
    return loadTrendReactionSource(admin, clientId, sourceIds);
  }

  if (idea.source_type === "content_resource") {
    if (!sourceIds[0]) return { ok: false, failure: IDEA_NOT_AVAILABLE };
    const { data, error } = await admin.from("content_resources").select("*")
      .eq("id", sourceIds[0]).eq("client_id", clientId)
      .eq("active", true).is("deleted_at", null).maybeSingle();
    if (error || !data) return { ok: false, failure: IDEA_NOT_AVAILABLE };
    return { ok: true, sourceContext: {
      sourceType: "content_resource", sourceIds, sourceTitle: data.title,
      source: data, selectedResource: data, sourceArticles: [],
    } };
  }

  if (idea.source_type === "profile_led") {
    const context = await getBusinessContext(admin, clientId);
    if (!context) return { ok: false, failure: IDEA_NOT_AVAILABLE };
    return { ok: true, sourceContext: {
      sourceType: "profile_led", sourceIds: [], sourceTitle: "Profile Principles & Frameworks",
      source: { principles: context.principles, personalPositioning: context.personalPositioning,
        contentPillars: context.contentPillars, roleAndWork: context.roleAndWork },
      sourceArticles: [],
    } };
  }

  if (idea.source_type === "research_brief" && sourceIds[0]) {
    const { data, error } = await admin.from("research_findings")
      .select("id,payload,approval_status").eq("client_id",clientId).eq("id",sourceIds[0])
      .eq("approval_status","approved").maybeSingle();
    const checked = storedFindingSchema.safeParse(data?.payload);
    if (error || !data || !checked.success) return { ok: false, failure: IDEA_NOT_AVAILABLE };
    return { ok: true, sourceContext: {
      sourceType: "research_brief", sourceIds: [data.id], sourceTitle: checked.data.title,
      source: { ...checked.data, findingId: data.id }, sourceArticles: checked.data.sources.map(source => ({ ...source })),
    } };
  }

  if (idea.source_type === "custom_upload" || idea.source_type === "research_brief") {
    const saved = z.object({ customNotes: z.string().max(4000).optional(),
      notes: z.string().max(4000).optional() }).safeParse(idea.source_context);
    const selectedDocument = z.object({ selectedDocument: z.object({
      id: z.string().uuid(), contentHash: z.string().length(64), version: z.number().int().positive(),
    }).optional() }).safeParse(idea.source_context && typeof idea.source_context === "object" && !Array.isArray(idea.source_context) ? idea.source_context : {});
    let source: Record<string, unknown> = saved.success ? saved.data : {};
    if (idea.source_type === "custom_upload" && sourceIds[0]) {
      const { data, error } = await admin.from("client_documents")
        .select("id, filename, content_text, content_hash, version, status, purpose")
        .eq("id", sourceIds[0]).eq("client_id", clientId)
        .eq("status", "ready").is("deleted_at", null).maybeSingle();
      if (error || !data) return { ok: false, failure: IDEA_NOT_AVAILABLE };
      if (!selectedDocument.success || (selectedDocument.data.selectedDocument && (
        selectedDocument.data.selectedDocument.id !== data.id ||
        selectedDocument.data.selectedDocument.contentHash !== data.content_hash ||
        selectedDocument.data.selectedDocument.contentHash !== computeContentHash(data.content_text) ||
        selectedDocument.data.selectedDocument.version !== data.version ||
        data.purpose !== "source_material" ||
        Buffer.byteLength(data.content_text, "utf8") > STANDALONE_SOURCE_MAX_BYTES
      ))) return { ok: false, failure: IDEA_NOT_AVAILABLE };
      source = { ...source, document: data };
    }
    if (!Object.values(source).some(Boolean)) return { ok: false, failure: IDEA_NOT_AVAILABLE };
    return { ok: true, sourceContext: {
      sourceType: idea.source_type, sourceIds,
      sourceTitle: idea.source_type === "custom_upload" ? "Custom Supporting Document" : "External Research & Signal",
      source, sourceArticles: [],
    } };
  }

  return { ok: false, failure: IDEA_NOT_AVAILABLE };
}

export type ReviewedPostValues = {
  editorial?: GenerationPlanV2["editorial"];
  finalPost: string;
  buyerBeliefShift: string;
  proofNotes: string;
  riskNotes: string;
  ctaIntent: string;
  qaResult: Record<string, unknown>;
  formatRecommendation: Record<string, unknown>;
  sourceContextUsed: Record<string, unknown>;
};

export async function produceReviewedPost(input: {
  clientId: string;
  userId: string;
  businessContext: ContentAgentBusinessContext;
  idea: ContentIdeaRow;
  sourceContext: ContentAgentSourceContext;
  resources: PlanningResource[];
  commentGateEligible: boolean;
  editNote?: string | null;
  /** Calendar jobs recheck their current lease/permissions before paid stages. */
  shouldContinue?: () => Promise<boolean>;
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
    if (input.shouldContinue && !(await input.shouldContinue())) return { ok: false, failure: GENERIC_FAILURE };
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

    // An assignment's allocation is separate from its source-record mode.
    if (input.idea.allocation_bucket && generationPlan.editorial) {
      generationPlan = { ...generationPlan, editorial: {
        ...generationPlan.editorial, allocationBucket: input.idea.allocation_bucket,
      } };
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

  // QA is advisory: every concern below becomes a warning stored with the post
  // for the human reviewer. Nothing here prevents the draft from being created.
  const warnings: QaWarningCode[] = [];
  if (generationPlan.strategy.readiness !== "ready") {
    warnings.push("strategy_exceeds_source");
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
  if (input.shouldContinue && !(await input.shouldContinue())) return { ok: false, failure: GENERIC_FAILURE };
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

  if (input.shouldContinue && !(await input.shouldContinue())) return { ok: false, failure: GENERIC_FAILURE };
  const reviewResult = await runReviewAgent({
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

  let qa = reviewResult.qa;
  let finalPost = qa.finalPost;
  let finalCta = qa.finalCta;

  // The reviewer declined to finalise the draft. Keep the Content Agent's
  // original draft rather than discarding the work, and flag it.
  if (!finalPost) {
    warnings.push("qa_fallback_to_draft");
    warnings.push(...warningsFromDeterministicIssues(initialDeterministicIssues));
    finalPost = buildFinalPost(agentResult.draft);
    finalCta = agentResult.draft.cta;
  }

  let finalDeterministicIssues = runDeterministicPostChecks({
    finalPost,
    cta: finalCta,
    plan: generationPlan,
    approvedProof: input.businessContext.approvedProof,
    selectedSource: sourceContext,
    phrasesToAvoid: input.businessContext.phrasesToAvoid,
    bannedTopics: input.businessContext.bannedTopics,
    selectedResource,
    primaryIcp: input.businessContext.primaryIcp,
  });

  // One bounded corrective pass. It no longer gatekeeps — it is only an
  // attempt to improve the draft before it reaches the human reviewer.
  if (finalDeterministicIssues.length > 0 && qa.finalPost) {
    if (input.shouldContinue && !(await input.shouldContinue())) return { ok: false, failure: GENERIC_FAILURE };
    const priorQa = qa;
    const reviewedDraft: GeneratedPostDraft = {
      hook: "",
      body: finalPost,
      cta: finalCta,
      format: "text",
      proofUsed: priorQa.proofNotes,
      riskNotes: priorQa.riskNotes,
    };
    const corrective = await runReviewAgent({
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

    if (corrective.ok && corrective.qa.finalPost) {
      qa = corrective.qa;
      finalPost = corrective.qa.finalPost;
      finalCta = corrective.qa.finalCta;
      finalDeterministicIssues = runDeterministicPostChecks({
        finalPost,
        cta: finalCta,
        plan: generationPlan,
        approvedProof: input.businessContext.approvedProof,
        selectedSource: sourceContext,
        phrasesToAvoid: input.businessContext.phrasesToAvoid,
        bannedTopics: input.businessContext.bannedTopics,
        selectedResource,
        primaryIcp: input.businessContext.primaryIcp,
      });
    }
  }

  warnings.push(...warningsFromDeterministicIssues(finalDeterministicIssues));
  warnings.push(...warningsFromFailedChecks(qa.checks));

  const warningCodes = dedupeWarnings(warnings);

  if (warningCodes.length > 0) {
    await writeAuditLog({
      clientId: input.clientId,
      userId: input.userId,
      action: "post_generated_with_warnings",
      entityType: "content_idea",
      entityId: input.idea.id,
      metadata: {
        idea_id: input.idea.id,
        source_type: input.idea.source_type,
        warning_codes: warningCodes,
        warning_count: warningCodes.length,
      },
    });
  }

  const selectedDocumentRecord = sourceContext.sourceType === "custom_upload"
    ? sourceContext.source.document as Record<string, unknown> | undefined : undefined;
  return {
    ok: true,
    values: {
      editorial: generationPlan.editorial,
      finalPost,
      buyerBeliefShift: `${generationPlan.strategy.currentBelief} -> ${generationPlan.strategy.desiredBelief}`,
      proofNotes: qa.proofNotes,
      riskNotes: composeRiskNotes(qa.riskNotes, warningCodes),
      ctaIntent: finalCta,
      qaResult: {
        ...qa,
        warnings: warningCodes,
        deterministicChecks: {
          initialIssues: initialDeterministicIssues,
          finalIssues: finalDeterministicIssues,
        },
      },
      formatRecommendation:
        qa.formatRecommendation ?? FALLBACK_FORMAT_RECOMMENDATION,
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
        editorial: generationPlan.editorial ?? null,
        ...(selectedDocumentRecord ? {
          document: { id: selectedDocumentRecord.id, filename: selectedDocumentRecord.filename,
            content_hash: selectedDocumentRecord.content_hash, version: selectedDocumentRecord.version },
        } : {}),
      },
    },
  };
}

async function getCalendarSlotForIdea(admin: AdminClient, clientId: string, ideaId: string) {
  const result = await admin.from("calendar_slots").select("id")
    .eq("client_id", clientId).eq("content_idea_id", ideaId).limit(1).maybeSingle();
  // The new column is absent before the P06 migration; legacy drafting still works.
  if (isMissingTableError(result.error) || result.error?.code === "42703" || result.error?.code === "PGRST204") {
    return { data: null, error: null };
  }
  return result;
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

  // A calendar backing idea must use its fenced batch commit, not this route.
  const { data: calendarSlot, error: calendarError } = await getCalendarSlotForIdea(admin, clientIdResult.data, idea.id);
  if (calendarError || calendarSlot) return { ok: false, code: "CALENDAR_ASSIGNMENT", message: "Draft this assignment from its Calendar batch." };

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
      ...(generated.values.editorial ? {
        allocation_bucket: generated.values.editorial.allocationBucket,
        post_type: generated.values.editorial.postType,
        funnel_stage: generated.values.editorial.funnelStage,
        intended_reader: generated.values.editorial.intendedReader ?? null,
        primary_takeaway: generated.values.editorial.primaryTakeaway ?? null,
        content_pillar: generated.values.editorial.contentPillar ?? null,
      } : {}),
      brief_overrides: idea.strategy_overrides ?? {},
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
      ...(generated.values.editorial ? {
        allocation_bucket: generated.values.editorial.allocationBucket,
        post_type: generated.values.editorial.postType,
        funnel_stage: generated.values.editorial.funnelStage,
        intended_reader: generated.values.editorial.intendedReader ?? null,
        primary_takeaway: generated.values.editorial.primaryTakeaway ?? null,
        content_pillar: generated.values.editorial.contentPillar ?? null,
      } : {}),
      brief_overrides: idea.strategy_overrides ?? {},
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

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAccessClient, canMutateClientWorkflow } from "@/lib/access/client-access";
import {
  runPlanningAgent,
  type GeneratedPlanningIdea,
  type PlanningBusinessContext,
  type PlanningMode,
  type PlanningSourceContext,
} from "@/features/ideas/agents/planning-agent";
import { writeAuditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

import { generateIdeasRequestSchema } from "./schemas";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type GeneratedIdeaRecord = {
  id: string;
  angle: string;
};

export type GenerateIdeasData = {
  mode: PlanningMode;
  sourceId: string;
  ideasCreated: number;
  ideas: GeneratedIdeaRecord[];
};

type AdminClient = ReturnType<typeof createAdminClient>;

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
  reference_material: unknown;
  publishing_preferences: unknown;
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
  | {
      ok: true;
      sourceContext: PlanningSourceContext;
      sourceIdsForIdea: string[];
      sourceTitle: string;
    }
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
  message: "This idea source is not available.",
};

const NO_ACCESS = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have access to this client.",
};

const WORKFLOW_FORBIDDEN = {
  ok: false as const,
  code: "FORBIDDEN",
  message: "You do not have permission to generate ideas for this Client Workspace.",
};

const SOURCE_NOT_AVAILABLE = {
  ok: false as const,
  code: "NOT_FOUND",
  message: "This idea source is not available.",
};

const TREND_CARD_NOT_APPROVED = {
  ok: false as const,
  code: "VALIDATION_ERROR",
  message: "This TrendCard must be approved for ideas first.",
};

const PLANNING_NOT_CONFIGURED = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "AI planning is not configured.",
};

const GENERIC_FAILURE = {
  ok: false as const,
  code: "UNKNOWN_ERROR",
  message: "Could not generate ideas. Please try again.",
};

function sourceIdsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => uuidSchema.safeParse(entry).success,
  );
}

function normalizeAngle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function getBusinessContext(
  admin: AdminClient,
  clientId: string,
): Promise<PlanningBusinessContext | null> {
  const { data, error } = await admin
    .from("clients")
    .select(
      "industry, business_description, primary_icp, main_offer, core_pov, content_pillars, approved_proof, banned_topics, founder_voice_sample, reference_material, publishing_preferences",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle<ClientContextRow>();

  if (error || !data) return null;

  return {
    industry: data.industry,
    businessDescription: data.business_description,
    primaryIcp: data.primary_icp,
    mainOffer: data.main_offer,
    corePov: data.core_pov,
    contentPillars: data.content_pillars,
    approvedProof: data.approved_proof,
    bannedTopics: data.banned_topics,
    founderVoiceSample: data.founder_voice_sample,
    referenceMaterial: data.reference_material,
    publishingPreferences: data.publishing_preferences,
  };
}

async function getRecentIdeaAngles(
  admin: AdminClient,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("content_ideas")
    .select("angle")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Array<{ angle: string }>>();

  if (error || !data) return [];

  return data.map((row) => row.angle);
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
    summary: row.summary ? row.summary.slice(0, 700) : null,
    url: row.url,
    source_name: row.source_name,
    published_at: row.published_at,
  }));
}

async function getTrendCard(
  admin: AdminClient,
  clientId: string,
  trendCardId: string,
): Promise<TrendCardRow | null> {
  const { data, error } = await admin
    .from("trend_cards")
    .select(
      "id, title, shift, why_it_matters, relevance_to_icp, content_angle, source_item_ids_json, confidence_score, founder_take, approved_for_ideas",
    )
    .eq("id", trendCardId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle<TrendCardRow>();

  if (error || !data) return null;
  return data;
}

async function loadFounderExperienceSource(
  admin: AdminClient,
  clientId: string,
  sourceId: string,
): Promise<SourceLoadResult> {
  const { data, error } = await admin
    .from("founder_experiences")
    .select(
      "id, title, what_happened, what_was_learned, what_changed, why_it_matters, entry_type, reaction_type, source_trend_card_id",
    )
    .eq("id", sourceId)
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .maybeSingle<FounderExperienceRow>();

  if (error || !data || data.entry_type === "trend_reaction") {
    return { ok: false, failure: SOURCE_NOT_AVAILABLE };
  }

  return {
    ok: true,
    sourceIdsForIdea: [data.id],
    sourceTitle: data.title,
    sourceContext: {
      mode: "founder_experience",
      sourceId: data.id,
      sourceTitle: data.title,
      source: {
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
  sourceId: string,
): Promise<SourceLoadResult> {
  const card = await getTrendCard(admin, clientId, sourceId);
  if (!card) return { ok: false, failure: SOURCE_NOT_AVAILABLE };
  if (!card.approved_for_ideas) {
    return { ok: false, failure: TREND_CARD_NOT_APPROVED };
  }

  const sourceItemIds = sourceIdsFromJson(card.source_item_ids_json);
  const sourceArticles = await getSourceArticles(admin, clientId, sourceItemIds);

  return {
    ok: true,
    sourceIdsForIdea: [card.id],
    sourceTitle: card.title,
    sourceContext: {
      mode: "trend_card",
      sourceId: card.id,
      sourceTitle: card.title,
      source: {
        title: card.title,
        shift: card.shift,
        why_it_matters: card.why_it_matters,
        relevance_to_icp: card.relevance_to_icp,
        content_angle: card.content_angle,
        confidence_score: card.confidence_score,
        founder_take: card.founder_take,
      },
      sourceArticles,
    },
  };
}

async function loadTrendReactionSource(
  admin: AdminClient,
  clientId: string,
  sourceId: string,
): Promise<SourceLoadResult> {
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
    return { ok: false, failure: SOURCE_NOT_AVAILABLE };
  }

  const card = await getTrendCard(admin, clientId, reaction.source_trend_card_id);
  if (!card) return { ok: false, failure: SOURCE_NOT_AVAILABLE };
  if (!card.approved_for_ideas) {
    return { ok: false, failure: TREND_CARD_NOT_APPROVED };
  }

  const sourceItemIds = sourceIdsFromJson(card.source_item_ids_json);
  const sourceArticles = await getSourceArticles(admin, clientId, sourceItemIds);

  return {
    ok: true,
    sourceIdsForIdea: [reaction.id, card.id],
    sourceTitle: reaction.title,
    sourceContext: {
      mode: "trend_reaction",
      sourceId: reaction.id,
      sourceTitle: reaction.title,
      linkedTrendCardId: card.id,
      linkedTrendCardTitle: card.title,
      source: {
        reaction_type: reaction.reaction_type,
        take: reaction.what_was_learned,
        proof_or_example: reaction.what_happened,
        what_changed: reaction.what_changed,
        why_it_matters: reaction.why_it_matters,
        trend_card: {
          title: card.title,
          shift: card.shift,
          why_it_matters: card.why_it_matters,
          relevance_to_icp: card.relevance_to_icp,
          content_angle: card.content_angle,
          confidence_score: card.confidence_score,
          founder_take: card.founder_take,
        },
      },
      sourceArticles,
    },
  };
}

async function loadSource(
  admin: AdminClient,
  clientId: string,
  mode: PlanningMode,
  sourceId: string,
): Promise<SourceLoadResult> {
  if (mode === "founder_experience") {
    return loadFounderExperienceSource(admin, clientId, sourceId);
  }

  if (mode === "trend_card") {
    return loadTrendCardSource(admin, clientId, sourceId);
  }

  return loadTrendReactionSource(admin, clientId, sourceId);
}

function toInsertRows(input: {
  clientId: string;
  mode: PlanningMode;
  sourceIdsForIdea: string[];
  sourceTitle: string;
  ideas: GeneratedPlanningIdea[];
  existingAngles: string[];
}) {
  const seenAngles = new Set(input.existingAngles.map(normalizeAngle));

  return input.ideas.flatMap((idea) => {
    const normalizedAngle = normalizeAngle(idea.angle);
    if (seenAngles.has(normalizedAngle)) return [];

    seenAngles.add(normalizedAngle);

    return [
      {
        client_id: input.clientId,
        source_type: input.mode,
        source_ids_json: input.sourceIdsForIdea,
        angle: idea.angle,
        buyer_pain: idea.buyerPain,
        commercial_relevance: idea.commercialRelevance,
        belief_shift: idea.beliefShift,
        content_pillar: idea.contentPillar,
        angle_boundary: idea.angleBoundary,
        source_context: {
          mode: input.mode,
          source_ids: input.sourceIdsForIdea,
          source_title: input.sourceTitle,
          generated_context: idea.sourceContext,
        },
        proof_notes: idea.proofNotes,
        founder_direction: null,
        status: "ready",
      },
    ];
  });
}

export async function generateContentIdeas(
  clientId: string,
  input: unknown,
): Promise<ServiceResult<GenerateIdeasData>> {
  const { user } = await getServerUser();
  if (!user) return AUTH_REQUIRED;

  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return INVALID_INPUT;

  const parsed = generateIdeasRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const hasAccess = await canAccessClient(user.id, clientIdResult.data);
  if (!hasAccess) return NO_ACCESS;

  const canMutate = await canMutateClientWorkflow(user.id, clientIdResult.data);
  if (!canMutate) return WORKFLOW_FORBIDDEN;

  const admin = createAdminClient();
  const businessContext = await getBusinessContext(admin, clientIdResult.data);
  if (!businessContext) return NO_ACCESS;

  const source = await loadSource(
    admin,
    clientIdResult.data,
    parsed.data.mode,
    parsed.data.sourceId,
  );
  if (!source.ok) return source.failure;

  const recentAngles = await getRecentIdeaAngles(admin, clientIdResult.data);
  const planningResult = await runPlanningAgent({
    clientId: clientIdResult.data,
    userId: user.id,
    businessContext,
    sourceContext: source.sourceContext,
    recentAngles,
  });

  if (!planningResult.ok) {
    return planningResult.reason === "not_configured"
      ? PLANNING_NOT_CONFIGURED
      : GENERIC_FAILURE;
  }

  const rows = toInsertRows({
    clientId: clientIdResult.data,
    mode: parsed.data.mode,
    sourceIdsForIdea: source.sourceIdsForIdea,
    sourceTitle: source.sourceTitle,
    ideas: planningResult.ideas,
    existingAngles: recentAngles,
  });

  if (rows.length === 0) {
    await writeAuditLog({
      clientId: clientIdResult.data,
      userId: user.id,
      action: "content_ideas_generated",
      entityType: "content_idea",
      metadata: {
        mode: parsed.data.mode,
        source_id: parsed.data.sourceId,
        ideas_created: 0,
      },
    });

    return {
      ok: true,
      data: {
        mode: parsed.data.mode,
        sourceId: parsed.data.sourceId,
        ideasCreated: 0,
        ideas: [],
      },
    };
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("content_ideas")
    .insert(rows)
    .select("id, angle")
    .returns<GeneratedIdeaRecord[]>();

  if (insertError || !inserted) return GENERIC_FAILURE;

  await writeAuditLog({
    clientId: clientIdResult.data,
    userId: user.id,
    action: "content_ideas_generated",
    entityType: "content_idea",
    entityId: inserted[0]?.id,
    metadata: {
      mode: parsed.data.mode,
      source_id: parsed.data.sourceId,
      ideas_created: inserted.length,
    },
  });

  revalidatePath(`/client/${clientIdResult.data}/ideas`);

  return {
    ok: true,
    data: {
      mode: parsed.data.mode,
      sourceId: parsed.data.sourceId,
      ideasCreated: inserted.length,
      ideas: inserted,
    },
  };
}

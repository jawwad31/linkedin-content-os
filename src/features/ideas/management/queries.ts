import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  generationPlanV2Schema,
  strategyOverridesSchema,
  type GenerationPlanV2,
  type StrategyOverrides,
} from "@/lib/ai/playbooks/contracts";

export type ContentIdeaSourceType =
  | "founder_experience"
  | "trend_card"
  | "trend_reaction";

export type ContentIdeaStatus = "draft" | "ready" | "used" | "archived";

export type ContentIdea = {
  id: string;
  sourceType: ContentIdeaSourceType;
  sourceLabel: string;
  sourceContext: string | null;
  sourceTitle: string | null;
  angle: string;
  buyerPain: string | null;
  commercialRelevance: string | null;
  beliefShift: string | null;
  contentPillar: string | null;
  angleBoundary: string | null;
  proofNotes: string | null;
  founderDirection: string | null;
  generationPlan: GenerationPlanV2 | null;
  strategyOverrides: StrategyOverrides;
  status: ContentIdeaStatus;
  existingPostId: string | null;
  createdAt: string;
};

type ContentIdeaRow = {
  id: string;
  source_type: ContentIdeaSourceType;
  source_context: unknown;
  angle: string;
  buyer_pain: string | null;
  commercial_relevance: string | null;
  belief_shift: string | null;
  content_pillar: string | null;
  angle_boundary: string | null;
  proof_notes: string | null;
  founder_direction: string | null;
  generation_plan: unknown;
  strategy_overrides: unknown;
  status: ContentIdeaStatus;
  created_at: string;
};

export type ContentIdeasResult =
  | { ok: true; ideas: ContentIdea[] }
  | { ok: false };

const SOURCE_LABELS: Record<ContentIdeaSourceType, string> = {
  founder_experience: "Founder Experience",
  trend_card: "TrendCard",
  trend_reaction: "Trend Reaction",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatSourceContext(value: unknown): {
  sourceContext: string | null;
  sourceTitle: string | null;
} {
  const directText = stringFromValue(value);
  if (directText) return { sourceContext: directText, sourceTitle: null };

  if (!isRecord(value)) return { sourceContext: null, sourceTitle: null };

  const generatedContext = stringFromValue(value.generated_context);
  const sourceTitle = stringFromValue(value.source_title);

  if (generatedContext) {
    return { sourceContext: generatedContext, sourceTitle };
  }

  const compactContext = JSON.stringify(value);
  return {
    sourceContext: compactContext === "{}" ? null : compactContext,
    sourceTitle,
  };
}

/**
 * Active Content Ideas for one client, newest first. Scoped by client_id;
 * RLS's content_ideas_select_accepted_access policy is the backstop.
 */
export async function getContentIdeas(
  clientId: string,
): Promise<ContentIdeasResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_ideas")
    .select(
      "id, source_type, source_context, angle, buyer_pain, commercial_relevance, belief_shift, content_pillar, angle_boundary, proof_notes, founder_direction, generation_plan, strategy_overrides, status, created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<ContentIdeaRow[]>();

  if (error) return { ok: false };

  const ideaIds = data.map((row) => row.id);
  const postIdByIdeaId = new Map<string, string>();

  if (ideaIds.length > 0) {
    const { data: postRows, error: postsError } = await supabase
      .from("posts")
      .select("id, content_idea_id, created_at")
      .eq("client_id", clientId)
      .in("content_idea_id", ideaIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<
        Array<{ id: string; content_idea_id: string | null; created_at: string }>
      >();

    if (postsError) return { ok: false };

    for (const row of postRows) {
      if (row.content_idea_id && !postIdByIdeaId.has(row.content_idea_id)) {
        postIdByIdeaId.set(row.content_idea_id, row.id);
      }
    }
  }

  return {
    ok: true,
    ideas: data.map((row) => {
      const source = formatSourceContext(row.source_context);
      const plan = generationPlanV2Schema.safeParse(row.generation_plan);
      const overrides = strategyOverridesSchema.safeParse(row.strategy_overrides);
      return {
        id: row.id,
        sourceType: row.source_type,
        sourceLabel: SOURCE_LABELS[row.source_type] ?? row.source_type,
        sourceContext: source.sourceContext,
        sourceTitle: source.sourceTitle,
        angle: row.angle,
        buyerPain: row.buyer_pain,
        commercialRelevance: row.commercial_relevance,
        beliefShift: row.belief_shift,
        contentPillar: row.content_pillar,
        angleBoundary: row.angle_boundary,
        proofNotes: row.proof_notes,
        founderDirection: row.founder_direction,
        generationPlan: plan.success ? plan.data : null,
        strategyOverrides: overrides.success ? overrides.data : {},
        status: row.status,
        existingPostId: postIdByIdeaId.get(row.id) ?? null,
        createdAt: row.created_at,
      };
    }),
  };
}

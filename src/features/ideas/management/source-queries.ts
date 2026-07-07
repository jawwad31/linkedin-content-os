import "server-only";

import { createClient } from "@/lib/supabase/server";

export type IdeaSourceMode =
  | "founder_experience"
  | "trend_card"
  | "trend_reaction";

export type ApprovedTrendCardSource = {
  id: string;
  title: string;
  shift: string | null;
  contentAngle: string | null;
  weekOf: string | null;
  confidenceScore: number | null;
};

export type FounderExperienceSource = {
  id: string;
  title: string;
  whatHappened: string | null;
  whatWasLearned: string | null;
  whatChanged: string | null;
  whyItMatters: string | null;
  createdAt: string;
};

export type TrendReactionSource = {
  id: string;
  title: string;
  reactionType: string | null;
  take: string | null;
  proofOrExample: string | null;
  linkedTrendCardTitle: string | null;
  createdAt: string;
};

export type IdeaSources = {
  approvedTrendCards: ApprovedTrendCardSource[];
  founderExperiences: FounderExperienceSource[];
  trendReactions: TrendReactionSource[];
};

export type IdeaSourcesResult =
  | { ok: true; sources: IdeaSources }
  | { ok: false };

type TrendCardSourceRow = {
  id: string;
  title: string;
  shift: string | null;
  content_angle: string | null;
  week_of: string | null;
  confidence_score: number | null;
};

type FounderExperienceSourceRow = {
  id: string;
  title: string;
  what_happened: string | null;
  what_was_learned: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  created_at: string;
};

type TrendReactionSourceRow = {
  id: string;
  title: string;
  reaction_type: string | null;
  what_happened: string | null;
  what_was_learned: string | null;
  source_trend_card_id: string;
  created_at: string;
};

type LinkedTrendCardRow = {
  id: string;
  title: string;
};

async function getApprovedTrendCardSources(
  clientId: string,
): Promise<ApprovedTrendCardSource[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trend_cards")
    .select("id, title, shift, content_angle, week_of, confidence_score")
    .eq("client_id", clientId)
    .eq("approved_for_ideas", true)
    .is("deleted_at", null)
    .order("week_of", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<TrendCardSourceRow[]>();

  if (error) return null;

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    shift: row.shift,
    contentAngle: row.content_angle,
    weekOf: row.week_of,
    confidenceScore: row.confidence_score,
  }));
}

async function getFounderExperienceSources(
  clientId: string,
): Promise<FounderExperienceSource[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("founder_experiences")
    .select(
      "id, title, what_happened, what_was_learned, what_changed, why_it_matters, created_at",
    )
    .eq("client_id", clientId)
    .eq("entry_type", "work_log")
    .is("source_trend_card_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<FounderExperienceSourceRow[]>();

  if (error) return null;

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    whatHappened: row.what_happened,
    whatWasLearned: row.what_was_learned,
    whatChanged: row.what_changed,
    whyItMatters: row.why_it_matters,
    createdAt: row.created_at,
  }));
}

async function getTrendReactionSources(
  clientId: string,
): Promise<TrendReactionSource[] | null> {
  const supabase = await createClient();

  const { data: reactions, error: reactionError } = await supabase
    .from("founder_experiences")
    .select(
      "id, title, reaction_type, what_happened, what_was_learned, source_trend_card_id, created_at",
    )
    .eq("client_id", clientId)
    .eq("entry_type", "trend_reaction")
    .not("source_trend_card_id", "is", null)
    .not("reaction_type", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<TrendReactionSourceRow[]>();

  if (reactionError) return null;
  if (reactions.length === 0) return [];

  const trendCardIds = Array.from(
    new Set(reactions.map((reaction) => reaction.source_trend_card_id)),
  );

  const { data: cards, error: cardError } = await supabase
    .from("trend_cards")
    .select("id, title")
    .eq("client_id", clientId)
    .eq("approved_for_ideas", true)
    .in("id", trendCardIds)
    .is("deleted_at", null)
    .returns<LinkedTrendCardRow[]>();

  if (cardError) return null;

  const cardTitleById = new Map(cards.map((card) => [card.id, card.title]));

  return reactions.flatMap((reaction) => {
    const linkedTrendCardTitle = cardTitleById.get(
      reaction.source_trend_card_id,
    );

    if (!linkedTrendCardTitle) return [];

    return [
      {
        id: reaction.id,
        title: reaction.title,
        reactionType: reaction.reaction_type,
        take: reaction.what_was_learned,
        proofOrExample: reaction.what_happened,
        linkedTrendCardTitle,
        createdAt: reaction.created_at,
      },
    ];
  });
}

/**
 * Eligible Planning Agent source records for the Ideas page launcher. All
 * queries are scoped by client_id and hide soft-deleted records.
 */
export async function getIdeaSources(
  clientId: string,
): Promise<IdeaSourcesResult> {
  const [approvedTrendCards, founderExperiences, trendReactions] =
    await Promise.all([
      getApprovedTrendCardSources(clientId),
      getFounderExperienceSources(clientId),
      getTrendReactionSources(clientId),
    ]);

  if (!approvedTrendCards || !founderExperiences || !trendReactions) {
    return { ok: false };
  }

  return {
    ok: true,
    sources: {
      approvedTrendCards,
      founderExperiences,
      trendReactions,
    },
  };
}

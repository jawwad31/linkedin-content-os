import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TrendCard = {
  id: string;
  title: string;
  shift: string | null;
  whyItMatters: string | null;
  relevanceToIcp: string | null;
  founderPov: string | null;
  contentAngle: string | null;
  evidence: string | null;
  sourceItemCount: number;
  confidenceScore: number | null;
  founderTake: string | null;
  approvedForIdeas: boolean;
  weekOf: string;
  reactionCount: number;
  createdAt: string;
};

type TrendCardRow = {
  id: string;
  title: string;
  shift: string | null;
  why_it_matters: string | null;
  relevance_to_icp: string | null;
  founder_pov: string | null;
  content_angle: string | null;
  evidence: string | null;
  source_item_ids_json: unknown;
  confidence_score: number | null;
  founder_take: string | null;
  approved_for_ideas: boolean;
  week_of: string;
  created_at: string;
};

export type RecentTrendCardsResult =
  | { ok: true; cards: TrendCard[] }
  | { ok: false };

/**
 * Most recently synthesized TrendCards for one client, newest first, with a
 * per-card count of trend reactions (founder_experiences rows linked via
 * source_trend_card_id). Scoped by client_id; RLS's
 * trend_cards_select_accepted_access policy is the backstop, not the primary
 * access gate (the [client_id] layout already verifies accepted access
 * before this ever runs).
 */
export async function getRecentTrendCards(
  clientId: string,
  limit = 20,
): Promise<RecentTrendCardsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trend_cards")
    .select(
      "id, title, shift, why_it_matters, relevance_to_icp, founder_pov, content_angle, evidence, source_item_ids_json, confidence_score, founder_take, approved_for_ideas, week_of, created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("week_of", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<TrendCardRow[]>();

  if (error) return { ok: false };

  const cardIds = data.map((row) => row.id);
  const reactionCounts = new Map<string, number>();

  if (cardIds.length > 0) {
    const { data: reactions, error: reactionsError } = await supabase
      .from("founder_experiences")
      .select("source_trend_card_id")
      .eq("client_id", clientId)
      .eq("entry_type", "trend_reaction")
      .in("source_trend_card_id", cardIds)
      .is("deleted_at", null);

    if (!reactionsError && reactions) {
      for (const reaction of reactions) {
        const id = reaction.source_trend_card_id as string | null;
        if (id) reactionCounts.set(id, (reactionCounts.get(id) ?? 0) + 1);
      }
    }
  }

  return {
    ok: true,
    cards: data.map((row) => ({
      id: row.id,
      title: row.title,
      shift: row.shift,
      whyItMatters: row.why_it_matters,
      relevanceToIcp: row.relevance_to_icp,
      founderPov: row.founder_pov,
      contentAngle: row.content_angle,
      evidence: row.evidence,
      sourceItemCount: Array.isArray(row.source_item_ids_json)
        ? row.source_item_ids_json.length
        : 0,
      confidenceScore: row.confidence_score,
      founderTake: row.founder_take,
      approvedForIdeas: row.approved_for_ideas,
      weekOf: row.week_of,
      reactionCount: reactionCounts.get(row.id) ?? 0,
      createdAt: row.created_at,
    })),
  };
}

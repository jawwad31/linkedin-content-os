import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TrendCardSource = {
  id: string;
  title: string;
  url: string;
};

export type TrendCard = {
  id: string;
  title: string;
  shift: string | null;
  whyItMatters: string | null;
  relevanceToIcp: string | null;
  contentAngle: string | null;
  sources: TrendCardSource[];
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
  content_angle: string | null;
  source_item_ids_json: unknown;
  confidence_score: number | null;
  founder_take: string | null;
  approved_for_ideas: boolean;
  week_of: string;
  created_at: string;
};

function toSourceIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

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
      "id, title, shift, why_it_matters, relevance_to_icp, content_angle, source_item_ids_json, confidence_score, founder_take, approved_for_ideas, week_of, created_at",
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

  // Resolve each card's cited article ids to title + url so the panel can
  // show real source links (the card's evidence). One query for all cards;
  // ids citing since-deleted articles simply resolve to nothing.
  const allSourceIds = Array.from(
    new Set(data.flatMap((row) => toSourceIdArray(row.source_item_ids_json))),
  );
  const sourcesById = new Map<string, TrendCardSource>();

  if (allSourceIds.length > 0) {
    const { data: sourceRows, error: sourcesError } = await supabase
      .from("market_signal_items")
      .select("id, title, url")
      .eq("client_id", clientId)
      .in("id", allSourceIds)
      .is("deleted_at", null);

    if (!sourcesError && sourceRows) {
      for (const row of sourceRows) {
        sourcesById.set(row.id, { id: row.id, title: row.title, url: row.url });
      }
    }
  }

  return {
    ok: true,
    cards: data.map((row) => {
      const sourceIds = toSourceIdArray(row.source_item_ids_json);
      return {
        id: row.id,
        title: row.title,
        shift: row.shift,
        whyItMatters: row.why_it_matters,
        relevanceToIcp: row.relevance_to_icp,
        contentAngle: row.content_angle,
        sources: sourceIds
          .map((id) => sourcesById.get(id))
          .filter((source): source is TrendCardSource => source !== undefined),
        sourceItemCount: sourceIds.length,
        confidenceScore: row.confidence_score,
        founderTake: row.founder_take,
        approvedForIdeas: row.approved_for_ideas,
        weekOf: row.week_of,
        reactionCount: reactionCounts.get(row.id) ?? 0,
        createdAt: row.created_at,
      };
    }),
  };
}

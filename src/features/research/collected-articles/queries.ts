import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CollectedArticleStatus = "new" | "relevant" | "irrelevant" | "used";

export type CollectedArticle = {
  id: string;
  title: string;
  sourceName: string | null;
  status: CollectedArticleStatus;
  relevanceScore: number | null;
  classificationReason: string | null;
  publishedAt: string | null;
  url: string;
};

type CollectedArticleRow = {
  id: string;
  title: string;
  source_name: string | null;
  status: CollectedArticleStatus;
  relevance_score: number | null;
  classification_reason: string | null;
  published_at: string | null;
  url: string;
};

export type RecentCollectedArticlesResult =
  | { ok: true; articles: CollectedArticle[] }
  | { ok: false };

/**
 * Most recently collected articles for one client, newest first. Read-only
 * — no mark relevant/irrelevant actions here yet. Scoped by client_id;
 * RLS's market_signal_items_select_accepted_access policy is the backstop,
 * not the primary access gate (the [client_id] layout already verifies
 * accepted access before this ever runs).
 */
export async function getRecentCollectedArticles(
  clientId: string,
  limit = 20,
): Promise<RecentCollectedArticlesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("market_signal_items")
    .select(
      "id, title, source_name, status, relevance_score, classification_reason, published_at, url",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("collected_at", { ascending: false })
    .limit(limit)
    .returns<CollectedArticleRow[]>();

  if (error) return { ok: false };

  return {
    ok: true,
    articles: data.map((row) => ({
      id: row.id,
      title: row.title,
      sourceName: row.source_name,
      status: row.status,
      relevanceScore: row.relevance_score,
      classificationReason: row.classification_reason,
      publishedAt: row.published_at,
      url: row.url,
    })),
  };
}

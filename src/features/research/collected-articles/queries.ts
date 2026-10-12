import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE,
  type CollectedArticlePageSize,
} from "./pagination";

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
  /** The Content Bank entry this article was saved as, if any. */
  contentBankEntryId: string | null;
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
  | {
      ok: true;
      articles: CollectedArticle[];
      pagination: CollectedArticlesPagination;
    }
  | { ok: false };

export type CollectedArticleStatusFilter = CollectedArticleStatus | "all";

export type CollectedArticleCounts = Record<CollectedArticleStatus, number> & {
  all: number;
};

export type CollectedArticleCountsResult =
  | { ok: true; counts: CollectedArticleCounts }
  | { ok: false };

export type CollectedArticlesPagination = {
  page: number;
  pageSize: CollectedArticlePageSize;
  total: number;
  totalPages: number;
};

const ARTICLE_STATUSES: CollectedArticleStatus[] = [
  "new",
  "relevant",
  "irrelevant",
  "used",
];

export function parseArticleStatusFilter(
  value: string | undefined,
): CollectedArticleStatusFilter {
  return value && (ARTICLE_STATUSES as string[]).includes(value)
    ? (value as CollectedArticleStatus)
    : "all";
}

/**
 * Most recently collected articles for one client, newest first, optionally
 * filtered to one status. Scoped by client_id; RLS's
 * market_signal_items_select_accepted_access policy is the backstop, not
 * the primary access gate (the [client_id] layout already verifies accepted
 * access before this ever runs).
 */
export async function getRecentCollectedArticles(
  clientId: string,
  status: CollectedArticleStatusFilter = "all",
  page = 1,
  pageSize: CollectedArticlePageSize = DEFAULT_COLLECTED_ARTICLE_PAGE_SIZE,
): Promise<RecentCollectedArticlesResult> {
  const supabase = await createClient();
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("market_signal_items")
    .select(
      "id, title, source_name, status, relevance_score, classification_reason, published_at, url",
      { count: "exact" },
    )
    .eq("client_id", clientId)
    .is("deleted_at", null);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query
    .order("collected_at", { ascending: false })
    .range(from, to)
    .returns<CollectedArticleRow[]>();

  if (error) return { ok: false };

  // Articles already saved to the Content Bank. A failed lookup only hides the "saved"
  // state; saving again is still safe because the database keeps one live entry per article.
  const savedEntries = new Map<string, string>();
  if (data.length > 0) {
    const saved = await supabase
      .from("founder_experiences")
      .select("id, source_article_id")
      .eq("client_id", clientId)
      .in("source_article_id", data.map((row) => row.id))
      .is("deleted_at", null);
    for (const entry of saved.data ?? []) {
      if (entry.source_article_id) savedEntries.set(entry.source_article_id, entry.id);
    }
  }

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
      contentBankEntryId: savedEntries.get(row.id) ?? null,
    })),
    pagination: {
      page: safePage,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    },
  };
}

/**
 * Per-status counts for the Collected Articles filter chips. Four cheap
 * head-only count queries; "all" is their sum.
 */
export async function getCollectedArticleCounts(
  clientId: string,
): Promise<CollectedArticleCountsResult> {
  const supabase = await createClient();

  const results = await Promise.all(
    ARTICLE_STATUSES.map((status) =>
      supabase
        .from("market_signal_items")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("status", status)
        .is("deleted_at", null),
    ),
  );

  if (results.some((result) => result.error)) return { ok: false };

  const counts = {
    new: results[0].count ?? 0,
    relevant: results[1].count ?? 0,
    irrelevant: results[2].count ?? 0,
    used: results[3].count ?? 0,
    all: 0,
  };
  counts.all = counts.new + counts.relevant + counts.irrelevant + counts.used;

  return { ok: true, counts };
}
